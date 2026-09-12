/**
 * Резервная копия базы.
 *
 *   npm run db:backup                  — копия в ./backups
 *   npm run db:backup -- --keep 30     — и удалить копии старше 30 дней
 *   npm run db:backup -- --out D:/bak  — в другой каталог
 *
 * Формат — сжатый дамп pg_dump (-Fc). Он восстанавливается выборочно,
 * по одной таблице, и не зависит от версии сервера так жёстко, как
 * копия файлов кластера.
 *
 * Важное про эти копии: они бесполезны без ключа шифрования.
 * Персональные данные лежат в дампе шифротекстом, а PII_ENCRYPTION_KEY
 * в базе не хранится — в этом и смысл. Копия базы без копии ключа
 * восстановит структуру и обезличенные поля, но не ФИО, почты и
 * телефоны. Ключ держат в секрет-менеджере и берегут отдельно, иначе
 * «у нас есть бэкапы» окажется неправдой в худший момент.
 *
 * И вторая половина: копия, которую ни разу не восстанавливали, —
 * это не копия, а предположение. Проверять восстановление стоит по
 * расписанию, на отдельной базе.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * pg_dump редко лежит в PATH на Windows: установщик кладёт его в
 * Program Files и путь не прописывает. Ищем в типовых местах, прежде
 * чем сдаваться, — иначе первая же попытка сделать копию упрётся в
 * «команда не найдена», и её отложат на потом.
 */
function findPgDump() {
  const explicit = process.env.PG_DUMP || arg('pg-dump', null);
  if (explicit) return explicit;

  const candidates = [];
  for (const major of [17, 16, 15, 14]) {
    candidates.push(`C:/Program Files/PostgreSQL/${major}/bin/pg_dump.exe`);
    candidates.push(`/usr/lib/postgresql/${major}/bin/pg_dump`);
  }
  candidates.push('/usr/local/bin/pg_dump', '/opt/homebrew/bin/pg_dump');

  for (const c of candidates) if (fs.existsSync(c)) return c;
  return 'pg_dump'; // пусть решает PATH
}

function prune(dir, keepDays) {
  const cutoff = Date.now() - keepDays * 86_400_000;
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.dump')) continue;
    const file = path.join(dir, name);
    if (fs.statSync(file).mtimeMs < cutoff) {
      fs.unlinkSync(file);
      removed++;
    }
  }
  return removed;
}

async function main() {
  // Копию снимает администратор: у роли приложения нет прав на чтение
  // системных каталогов, которые нужны pg_dump
  const raw = env('DIRECT_DATABASE_URL') || env('DATABASE_URL');
  if (!raw) {
    console.error('Ни DIRECT_DATABASE_URL, ни DATABASE_URL не заданы.');
    process.exitCode = 1;
    return;
  }

  const url = new URL(raw);
  const database = url.pathname.slice(1).split('?')[0];
  const outDir = path.resolve(process.cwd(), arg('out', 'backups'));
  fs.mkdirSync(outDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = path.join(outDir, `${database}-${stamp}.dump`);

  const args = [
    '-h', url.hostname,
    '-p', url.port || '5432',
    '-U', decodeURIComponent(url.username),
    '-d', database,
    '-Fc',
    '-f', target,
  ];

  const started = Date.now();
  const code = await new Promise((resolve) => {
    const child = spawn(findPgDump(), args, {
      // Пароль уходит переменной окружения, а не аргументом: аргументы
      // видны в списке процессов любому пользователю машины
      env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password || '') },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('error', (e) => {
      console.error(`Не удалось запустить pg_dump: ${e.message}`);
      console.error('Укажите путь: npm run db:backup -- --pg-dump "C:/Program Files/PostgreSQL/16/bin/pg_dump.exe"');
      resolve(1);
    });
    child.on('close', resolve);
  });

  if (code !== 0) {
    process.exitCode = 1;
    return;
  }

  const size = fs.statSync(target).size;
  console.log(
    `копия: ${target}\n` +
      `размер: ${(size / 1024).toFixed(0)} КБ, за ${((Date.now() - started) / 1000).toFixed(1)} с`,
  );

  const keep = Number(arg('keep', 0));
  if (keep > 0) {
    const removed = prune(outDir, keep);
    console.log(`удалено копий старше ${keep} дней: ${removed}`);
  }

  console.log(
    '\nНапоминание: без PII_ENCRYPTION_KEY из этой копии не восстановить\n' +
      'ФИО, почты и телефоны. Храните ключ отдельно от копий.',
  );
}

main().catch((error) => {
  console.error('Копия не снята:', error.message);
  process.exitCode = 1;
});
