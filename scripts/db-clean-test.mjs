/**
 * Убрать из базы учётные записи, оставленные сквозной проверкой.
 *
 *   npm run db:clean-test              — показать, что нашлось
 *   npm run db:clean-test -- --apply   — удалить
 *
 * Зачем. `npm run smoke` регистрирует студента заново на каждом прогоне:
 * адрес вида smoke-<время>@demo.ru. В демо-режиме такие учётки жили до
 * перезапуска сервера и исчезали сами. На настоящей базе они остаются
 * навсегда, и за месяц разработки база обрастает сотнями анкет, которые
 * портят статистику администратора и выдачу работодателю.
 *
 * Удаляются только адреса, точно совпадающие с шаблоном, который
 * порождает сама проверка. Шаблон намеренно узкий: «всё, что похоже на
 * тестовое» — это способ однажды снести живого человека.
 *
 * Каскады в схеме довершают остальное: вместе с учётной записью уходят
 * анкета, свайпы, отклики и переписка. Журнал аудита остаётся — у него
 * ссылка обнуляется, а не удаляется, и это правильно: журнал не должен
 * терять записи вместе с тем, о ком они.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Ровно то, что порождает tests/smoke.ts, и ничего кроме: студент, студент
 * для проверки профиля, компания и попытка регистрации младше 18.
 */
const SMOKE_EMAIL = /^smoke-(?:company-|profile-|minor-)?\d+@demo\.ru$/;

function env(key) {
  const file = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(file)) return undefined;
  return fs
    .readFileSync(file, 'utf8')
    .match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\n]*)`, 'm'))?.[1]
    ?.trim();
}

function encKey(rawKey) {
  const master = /^[0-9a-f]{64}$/i.test(rawKey)
    ? Buffer.from(rawKey, 'hex')
    : Buffer.from(rawKey, 'base64').length >= 32
      ? Buffer.from(rawKey, 'base64').subarray(0, 32)
      : crypto.createHash('sha256').update(rawKey).digest();
  return Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), 'pii-encryption', 32));
}

function decrypt(payload, key) {
  const [v, iv, tag, ct] = payload.split('.');
  if (v !== 'v1') throw new Error('формат');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Не для боевой базы: сквозную проверку на ней не гоняют, а удалять там нечего.');
    process.exitCode = 1;
    return;
  }

  const rawKey = env('PII_ENCRYPTION_KEY');
  if (!env('DATABASE_URL')) {
    console.error('DATABASE_URL не задан — в памяти процесса убирать нечего.');
    process.exitCode = 1;
    return;
  }

  const apply = process.argv.includes('--apply');
  const key = encKey(rawKey ?? '');
  const db = new PrismaClient();

  const accounts = await db.account.findMany({ select: { id: true, emailEnc: true } });
  const doomed = [];
  let unreadable = 0;

  for (const a of accounts) {
    let email;
    try {
      email = decrypt(a.emailEnc, key);
    } catch {
      // Строка другим ключом — трогать её тем более нельзя
      unreadable++;
      continue;
    }
    if (SMOKE_EMAIL.test(email)) doomed.push({ id: a.id, email });
  }

  if (unreadable) {
    console.log(`не читаются текущим ключом: ${unreadable} (пропущены; см. npm run keys:rotate)\n`);
  }

  if (!doomed.length) {
    console.log('учёток от сквозной проверки не найдено');
    await db.$disconnect();
    return;
  }

  console.log(`учёток от сквозной проверки: ${doomed.length}`);
  for (const d of doomed.slice(0, 10)) console.log(`  ${d.email}`);
  if (doomed.length > 10) console.log(`  …и ещё ${doomed.length - 10}`);

  if (!apply) {
    console.log('\nНичего не удалено. Повторите с --apply.');
    await db.$disconnect();
    return;
  }

  const { count } = await db.account.deleteMany({ where: { id: { in: doomed.map((d) => d.id) } } });
  console.log(`\nудалено учётных записей: ${count} (анкеты, свайпы, отклики и переписка — каскадом)`);
  await db.$disconnect();
}

main().catch((error) => {
  console.error('Уборка не завершилась:', error.message);
  process.exitCode = 1;
});
