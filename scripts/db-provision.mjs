/**
 * Завести для приложения отдельную роль в PostgreSQL.
 *
 *   npm run db:provision            — создать роль и выдать права
 *   npm run db:provision -- --rotate — сменить ей пароль
 *
 * Зачем. По умолчанию приложение подключается тем же суперпользователем,
 * которым создавали базу. Тогда утёкшая строка подключения — а она лежит
 * в переменной окружения на каждом сервере — означает не доступ к данным
 * платформы, а полный контроль над СУБД: соседние базы, роли, файлы через
 * COPY FROM PROGRAM. Отдельная роль ограничивает ущерб одной базой.
 *
 * Права выданы ровно под работу приложения: читать и писать строки.
 * Создавать и удалять таблицы она не может — это делают миграции, и
 * ходят они отдельной строкой подключения DIRECT_DATABASE_URL. Поэтому
 * SQL-инъекция в рантайме не может ни удалить таблицу, ни завести себе
 * роль: у роли просто нет таких прав, и проверка здесь не в коде.
 *
 * Пароль генерируется случайным и сразу уходит в .env. Он нигде не
 * печатается: вывод команды попадает в историю оболочки и в логи CI.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const APP_ROLE = 'fhr_app';
const ENV_PATH = path.resolve(process.cwd(), '.env');

function readEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error('Нет .env. Скопируйте .env.example и задайте DATABASE_URL.');
    process.exit(1);
  }
  return fs.readFileSync(ENV_PATH, 'utf8');
}

function pick(env, key) {
  return env.match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\n]*)`, 'm'))?.[1]?.trim();
}

function upsert(env, key, value) {
  const line = `${key}="${value}"`;
  return new RegExp(`^\\s*${key}\\s*=`, 'm').test(env)
    ? env.replace(new RegExp(`^\\s*${key}\\s*=.*$`, 'm'), line)
    : `${env.trimEnd()}\n${line}\n`;
}

/**
 * Пароль без символов, которые ломают строку подключения.
 *
 * Экранировать их в URL можно, но строку потом читают и правят руками —
 * в .env, в настройках хостинга, в секрет-менеджере. Пароль, который
 * нельзя скопировать без раздумий, однажды скопируют неправильно.
 *
 * Ограничение алфавита здесь же делает безопасной подстановку пароля
 * прямо в текст команды ниже: PostgreSQL не принимает параметры в CREATE
 * ROLE, подставлять приходится литералом. Буквы и цифры не могут закрыть
 * кавычку, но на всякий случай это ещё и проверяется перед отправкой.
 */
function makePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(40);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function assertSafeLiteral(value) {
  if (!/^[A-Za-z0-9]+$/.test(value)) throw new Error('пароль вышел за пределы алфавита');
  return value;
}

async function main() {
  const rotate = process.argv.includes('--rotate');
  const env = readEnv();

  // Административное подключение: сначала явное, иначе текущее рабочее —
  // на свежей машине оно ещё суперпользовательское, этим и пользуемся
  const adminRaw = pick(env, 'DIRECT_DATABASE_URL') || pick(env, 'DATABASE_URL');
  if (!adminRaw) {
    console.error('Ни DIRECT_DATABASE_URL, ни DATABASE_URL не заданы.');
    process.exit(1);
  }

  const admin = new URL(adminRaw);
  const database = admin.pathname.slice(1).split('?')[0];
  if (admin.username === APP_ROLE) {
    console.error(
      `DIRECT_DATABASE_URL указывает на саму роль ${APP_ROLE} — прав на выдачу прав у неё нет.\n` +
        'Подставьте туда administratora базы (того, кем её создавали).',
    );
    process.exit(1);
  }

  const db = new PrismaClient({ datasourceUrl: admin.toString() });

  const found = await db.$queryRaw`select 1 from pg_roles where rolname = ${APP_ROLE}`;

  let password = null;
  if (!found.length) {
    password = assertSafeLiteral(makePassword());
    await db.$executeRawUnsafe(`create role ${APP_ROLE} with login password '${password}'`);
    console.log(`роль ${APP_ROLE}: создана`);
  } else if (rotate) {
    password = assertSafeLiteral(makePassword());
    await db.$executeRawUnsafe(`alter role ${APP_ROLE} with password '${password}'`);
    console.log(`роль ${APP_ROLE}: пароль сменён`);
  } else {
    console.log(`роль ${APP_ROLE}: уже есть, пароль не трогаю (--rotate — сменить)`);
  }

  // --- Права ---------------------------------------------------------
  const grants = [
    // Подключение к базе и вход в схему
    `grant connect on database "${database}" to ${APP_ROLE}`,
    `grant usage on schema public to ${APP_ROLE}`,

    // Строки читать и писать
    `grant select, insert, update, delete on all tables in schema public to ${APP_ROLE}`,
    `grant usage, select on all sequences in schema public to ${APP_ROLE}`,

    // Таблицы, которые заведут будущие миграции, тоже должны открыться:
    // без этого каждая новая таблица была бы невидима приложению до
    // ручной выдачи прав, а обнаружилось бы это уже на бою
    `alter default privileges in schema public
       grant select, insert, update, delete on tables to ${APP_ROLE}`,
    `alter default privileges in schema public grant usage, select on sequences to ${APP_ROLE}`,

    // И ровно то, чего у приложения быть не должно: создание объектов.
    // В PostgreSQL 15+ это уже по умолчанию, но полагаться на версию
    // сервера в вопросе прав не стоит.
    `revoke create on schema public from public`,
    `revoke create on schema public from ${APP_ROLE}`,
  ];
  for (const sql of grants) await db.$executeRawUnsafe(sql);
  console.log('права: чтение и запись строк выданы, создание объектов запрещено');

  await db.$disconnect();

  // --- Строки подключения --------------------------------------------
  if (password) {
    const app = new URL(admin.toString());
    app.username = APP_ROLE;
    app.password = password;

    let next = upsert(env, 'DIRECT_DATABASE_URL', admin.toString());
    next = upsert(next, 'DATABASE_URL', app.toString());
    fs.writeFileSync(ENV_PATH, next);
    console.log(
      '.env обновлён: DATABASE_URL — роль приложения, DIRECT_DATABASE_URL — администратор для миграций',
    );
  } else if (!pick(env, 'DIRECT_DATABASE_URL')) {
    fs.writeFileSync(ENV_PATH, upsert(env, 'DIRECT_DATABASE_URL', admin.toString()));
    console.log('.env: добавлен DIRECT_DATABASE_URL для миграций');
  }
}

main().catch((error) => {
  console.error('Не удалось завести роль:', error.message);
  process.exitCode = 1;
});
