/**
 * Проверка готовности базы к бою.
 *
 *   npm run db:verify
 *
 * Смысл не в том, чтобы «всё работает» — это показывает npm run smoke.
 * Здесь проверяется то, что обычно обнаруживается уже после запуска:
 * какими правами ходит приложение, лежат ли персональные данные
 * зашифрованными, есть ли история миграций, не уехал ли ключ, не
 * остались ли в базе демонстрационные учётки.
 *
 * Каждая проверка отвечает на вопрос «что случится, если это не так»,
 * и печатает его при провале. Проверка, смысл которой приходится
 * вспоминать, со временем начинает просто игнорироваться.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const DEV_MASTER = 'fattakhov-dev-master-key-do-not-use-in-production';

/** Адреса, которые заводит prisma/seed.ts. Живых людей на demo.ru нет. */
const DEMO_EMAILS = [
  'student@demo.ru',
  'admin@fattakhov.ru',
  'student2@demo.ru',
  'student3@demo.ru',
  'student4@demo.ru',
  'student5@demo.ru',
  'student6@demo.ru',
];

/**
 * Слепой индекс повторяет lib/security/crypto.ts.
 *
 * Импортировать оттуда нельзя: тот модуль на TypeScript и помечен
 * server-only, а это обычный скрипт для node. Совпадение вывода
 * проверяется тем же способом, что и вся эта проверка, — на живой базе:
 * не сойдись формула, демо-учётки просто не нашлись бы.
 */
function blindIndex(value, rawKey) {
  const master = /^[0-9a-f]{64}$/i.test(rawKey)
    ? Buffer.from(rawKey, 'hex')
    : Buffer.from(rawKey, 'base64').length >= 32
      ? Buffer.from(rawKey, 'base64').subarray(0, 32)
      : crypto.createHash('sha256').update(rawKey).digest();
  const idx = Buffer.from(
    crypto.hkdfSync('sha256', master, Buffer.alloc(0), 'pii-blind-index', 32),
  );
  return crypto.createHmac('sha256', idx).update(value.trim().toLowerCase()).digest('hex');
}

let failed = 0;
let warned = 0;

function ok(title, detail = '') {
  console.log(`  ok    ${title}${detail ? ' — ' + detail : ''}`);
}
function fail(title, why) {
  failed++;
  console.log(`  ПЛОХО ${title}\n        ${why}`);
}
function warn(title, why) {
  warned++;
  console.log(`  ~     ${title}\n        ${why}`);
}

function env(key) {
  // Сначала окружение, потом .env. В контейнере файла нет — переменные
  // приходят окружением из deploy/.env; читай скрипт только файл, на
  // сервере он сообщал бы «DATABASE_URL не задан» при работающей базе.
  const fromProcess = process.env[key]?.trim();
  if (fromProcess) return fromProcess;
  const file = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(file)) return undefined;
  return fs
    .readFileSync(file, 'utf8')
    .match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\n]*)`, 'm'))?.[1]
    ?.trim();
}

async function main() {
  const url = env('DATABASE_URL');
  if (!url) {
    console.error('DATABASE_URL не задан — проверять нечего, приложение работает в памяти процесса.');
    process.exitCode = 1;
    return;
  }

  const db = new PrismaClient();

  console.log('\nПрава подключения\n');

  const [who] = await db.$queryRaw`
    select current_user::text as name,
           (select rolsuper from pg_roles where rolname = current_user) as superuser`;

  if (who.superuser) {
    fail(
      `приложение ходит суперпользователем (${who.name})`,
      'утёкшая строка подключения даст контроль над всей СУБД, а не над одной базой:\n' +
        '        соседние базы, роли, чтение файлов сервера. Заведите роль: npm run db:provision',
    );
  } else {
    ok('приложение ходит не суперпользователем', who.name);
  }

  // Главная граница: рантайм не должен уметь менять структуру. Проверяем
  // не права в каталоге, а поведение — попыткой создать таблицу.
  try {
    await db.$executeRawUnsafe('create table "_probe_privileges"(x int)');
    await db.$executeRawUnsafe('drop table "_probe_privileges"');
    fail(
      'роль приложения может создавать таблицы',
      'SQL-инъекция в рантайме сможет снести таблицу или завести себе роль.\n' +
        '        Права на DDL должны быть только у DIRECT_DATABASE_URL.',
    );
  } catch {
    ok('создавать таблицы приложению запрещено');
  }

  const direct = env('DIRECT_DATABASE_URL');
  if (!direct) {
    warn('DIRECT_DATABASE_URL не задан', 'миграции будут ходить правами приложения');
  } else if (direct === url) {
    warn(
      'DIRECT_DATABASE_URL совпадает с DATABASE_URL',
      'для машины разработчика это нормально, для боя — нет: разделение прав пропадает',
    );
  } else {
    ok('строки для рантайма и для миграций разные');
  }

  console.log('\nСхема и миграции\n');

  const [{ n: migrations }] = await db.$queryRaw`
    select count(*)::int as n from pg_tables
    where schemaname = 'public' and tablename = '_prisma_migrations'`;

  if (!migrations) {
    fail(
      'истории миграций нет',
      'схема залита через db push. На бою изменить её будет нечем:\n' +
        '        ни воспроизводимого порядка изменений, ни отката.',
    );
  } else {
    const applied = await db.$queryRaw`
      select migration_name, finished_at, rolled_back_at
      from _prisma_migrations order by started_at`;
    const broken = applied.filter((m) => !m.finished_at || m.rolled_back_at);
    if (broken.length) {
      fail(
        'есть незавершённые миграции',
        broken.map((m) => m.migration_name).join(', '),
      );
    } else {
      ok('история миграций цела', `применено: ${applied.length}`);
    }
  }

  console.log('\nПерсональные данные\n');

  const rawKey = env('PII_ENCRYPTION_KEY');
  if (!rawKey || rawKey.length < 32) {
    fail(
      'PII_ENCRYPTION_KEY не задан',
      'в разработке подставляется общеизвестный ключ из исходников.\n' +
        '        На бою это равнозначно хранению ПДн открытым текстом. npm run keys',
    );
  } else if (rawKey === DEV_MASTER) {
    fail('PII_ENCRYPTION_KEY — ключ из исходников', 'он известен всем, у кого есть репозиторий');
  } else {
    ok('ключ шифрования ПДн задан');
  }

  // Шифротекст узнаётся по формату v1.<iv>.<tag>.<ct>. Строка, не
  // подходящая под него, лежит в базе открытым текстом.
  const shaped = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  const accounts = await db.account.findMany({ select: { emailEnc: true } });
  const students = await db.student.findMany({ select: { fullNameEnc: true, phoneEnc: true, birthDateEnc: true } });
  const employers = await db.employer.findMany({ select: { phoneEnc: true } });
  const messages = await db.message.findMany({ select: { bodyEnc: true } });

  const plain = [
    ...accounts.map((a) => a.emailEnc),
    ...students.flatMap((s) => [s.fullNameEnc, s.phoneEnc, s.birthDateEnc]),
    ...employers.map((e) => e.phoneEnc),
    ...messages.map((m) => m.bodyEnc),
  ].filter((v) => v && !shaped.test(v));

  if (plain.length) {
    fail(`${plain.length} значений ПДн лежат не зашифрованными`, 'ожидается формат v1.<iv>.<tag>.<ct>');
  } else {
    ok(
      'ПДн зашифрованы',
      `проверено значений: ${accounts.length + students.length * 2 + messages.length}`,
    );
  }

  const jwt = env('JWT_SECRET');
  if (!jwt || jwt.length < 32) {
    fail('JWT_SECRET короче 32 символов или не задан', 'сессии можно будет подделать');
  } else {
    ok('JWT_SECRET задан');
  }

  console.log('\nСодержимое базы\n');

  const counts = {
    Account: await db.account.count(),
    Student: await db.student.count(),
    Employer: await db.employer.count(),
    Vacancy: await db.vacancy.count(),
    Application: await db.application.count(),
    Message: await db.message.count(),
    AuditLog: await db.auditLog.count(),
  };
  ok('таблицы читаются', Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '));

  // Демо-учётки на бою — готовый вход с паролем из репозитория.
  // Найти их можно, не расшифровывая базу: слепой индекс детерминирован,
  // поэтому достаточно посчитать его от известных адресов сида.
  if (rawKey && rawKey.length >= 32) {
    const hashes = DEMO_EMAILS.map((e) => blindIndex(e, rawKey));
    const demo = await db.account.count({ where: { emailHash: { in: hashes } } });
    if (demo) {
      const message =
        `найдено: ${demo}. Пароли этих учёток лежат в репозитории. ` +
        'Перед боем: удалить и завести админа через npm run admin:create';
      if (process.env.NODE_ENV === 'production') fail('на базе есть демо-учётки', message);
      else warn('на базе есть демо-учётки', message);
    } else {
      ok('демо-учёток нет');
    }
  }

  console.log(
    `\n${failed ? `провалено проверок: ${failed}` : 'все проверки пройдены'}` +
      `${warned ? `, предупреждений: ${warned}` : ''}\n`,
  );
  process.exitCode = failed ? 1 : 0;

  await db.$disconnect();
}

main().catch((error) => {
  console.error('Проверка не завершилась:', error.message);
  process.exitCode = 1;
});
