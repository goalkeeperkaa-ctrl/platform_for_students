import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { blindIndex, encrypt } from '../lib/security/crypto';

/**
 * Перешифровать персональные данные со старого ключа на текущий.
 *
 *   npm run keys:rotate              — только отчёт, ничего не меняет
 *   npm run keys:rotate -- --apply   — переписать строки
 *
 * Зачем это вообще нужно. Из `PII_ENCRYPTION_KEY` выводятся два подключа:
 * шифрование полей и слепой индекс для поиска по почте. Смена мастер-ключа
 * делает обе операции несовместимыми со старыми строками, причём молча:
 * приложение не падает, а перестаёт находить учётные записи — вход
 * отвечает «неверная почта или пароль» при верном пароле, а ФИО и телефоны
 * превращаются в нечитаемый набор символов. Без этого скрипта единственным
 * выходом было бы вернуть старый ключ или потерять данные.
 *
 * Ровно это уже случилось один раз: базу засеяли, когда `PII_ENCRYPTION_KEY`
 * был пуст, то есть резервным ключом разработки, а потом ключ задали.
 *
 * Старый ключ берётся из `PII_ENCRYPTION_KEY_OLD`. Если переменная пуста,
 * подразумевается тот самый резервный ключ разработки — это и есть случай
 * «забыли задать ключ до первого сида».
 *
 * Скрипт можно запускать повторно: строки, которые уже читаются текущим
 * ключом, он пропускает. Строку, не читаемую ни одним из двух ключей,
 * он не трогает и показывает в отчёте — угадывать её содержимое нечем.
 */

// Должен совпадать с резервным ключом из lib/security/crypto.ts: там он
// намеренно детерминированный, чтобы база, засеянная вчера, читалась сегодня
const DEV_MASTER = 'fattakhov-dev-master-key-do-not-use-in-production';

function masterFrom(raw: string | undefined): Buffer {
  if (raw && raw.length >= 32) {
    if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
    const b64 = Buffer.from(raw, 'base64');
    if (b64.length >= 32) return b64.subarray(0, 32);
    return crypto.createHash('sha256').update(raw).digest();
  }
  return crypto.createHash('sha256').update(DEV_MASTER).digest();
}

function encKeyFrom(raw: string | undefined): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', masterFrom(raw), Buffer.alloc(0), 'pii-encryption', 32),
  );
}

/** Расшифровка произвольным ключом: текущий ключ знает только сам модуль crypto. */
function decryptWith(payload: string, key: Buffer): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('неизвестный формат');
  const [, iv, tag, ct] = parts;
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

type Verdict = { text: string; stale: boolean } | null;

/**
 * Читает поле сначала текущим ключом, затем старым.
 *
 * Порядок важен: строка, уже переписанная прошлым запуском, обязана
 * распознаться как свежая, иначе повторный прогон зашифровал бы её
 * поверх — и данные потерялись бы уже по вине самого инструмента.
 */
function read(payload: string, fresh: Buffer, stale: Buffer): Verdict {
  try {
    return { text: decryptWith(payload, fresh), stale: false };
  } catch {
    /* не текущий ключ — пробуем старый */
  }
  try {
    return { text: decryptWith(payload, stale), stale: true };
  } catch {
    return null;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL не задан: перешифровывать нечего, данные лежат в памяти процесса.');
    process.exitCode = 1;
    return;
  }

  const apply = process.argv.includes('--apply');
  const fresh = encKeyFrom(process.env.PII_ENCRYPTION_KEY);
  const stale = encKeyFrom(process.env.PII_ENCRYPTION_KEY_OLD);

  if (fresh.equals(stale)) {
    console.error(
      'Старый и текущий ключи совпадают — перешифровывать нечего.\n' +
        'Задайте PII_ENCRYPTION_KEY_OLD, если данные зашифрованы другим ключом.',
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  const stats = { fresh: 0, rotated: 0, unreadable: 0 };
  const lost: string[] = [];

  console.log(apply ? 'Перешифровка (запись включена)\n' : 'Отчёт без записи. Для записи: --apply\n');

  // --- Учётные записи: почта и слепой индекс -------------------------
  const accounts = await prisma.account.findMany({
    select: { id: true, role: true, emailEnc: true },
  });
  for (const a of accounts) {
    const v = read(a.emailEnc, fresh, stale);
    if (!v) {
      stats.unreadable++;
      lost.push(`Account ${a.id} (${a.role})`);
      continue;
    }
    if (!v.stale) {
      stats.fresh++;
      continue;
    }
    stats.rotated++;
    if (apply) {
      // Слепой индекс пересчитывается обязательно: без этого вход по почте
      // продолжит не находить учётку, даже когда сама почта уже читается
      await prisma.account.update({
        where: { id: a.id },
        data: { emailEnc: encrypt(v.text), emailHash: blindIndex(v.text) },
      });
    }
  }
  console.log(`  Account   всего ${accounts.length}`);

  // --- Студенты: ФИО и телефон ---------------------------------------
  const students = await prisma.student.findMany({
    select: { id: true, fullNameEnc: true, phoneEnc: true, birthDateEnc: true },
  });
  for (const s of students) {
    const name = read(s.fullNameEnc, fresh, stale);
    const phone = s.phoneEnc ? read(s.phoneEnc, fresh, stale) : undefined;
    const birth = s.birthDateEnc ? read(s.birthDateEnc, fresh, stale) : undefined;

    if (!name || phone === null || birth === null) {
      stats.unreadable++;
      lost.push(`Student ${s.id}`);
      continue;
    }
    if (!name.stale && (!phone || !phone.stale) && (!birth || !birth.stale)) {
      stats.fresh++;
      continue;
    }
    stats.rotated++;
    if (apply) {
      await prisma.student.update({
        where: { id: s.id },
        data: {
          fullNameEnc: encrypt(name.text),
          ...(phone ? { phoneEnc: encrypt(phone.text) } : {}),
          ...(birth ? { birthDateEnc: encrypt(birth.text) } : {}),
        },
      });
    }
  }
  console.log(`  Student   всего ${students.length}`);

  // --- Компании: телефон контактного лица ----------------------------
  const employers = await prisma.employer.findMany({
    where: { phoneEnc: { not: null } },
    select: { id: true, phoneEnc: true },
  });
  for (const e of employers) {
    const phone = read(e.phoneEnc as string, fresh, stale);
    if (!phone) {
      stats.unreadable++;
      lost.push(`Employer ${e.id}`);
      continue;
    }
    if (!phone.stale) {
      stats.fresh++;
      continue;
    }
    stats.rotated++;
    if (apply) {
      await prisma.employer.update({ where: { id: e.id }, data: { phoneEnc: encrypt(phone.text) } });
    }
  }
  console.log(`  Employer  всего ${employers.length}`);

  // --- Переписка ------------------------------------------------------
  const messages = await prisma.message.findMany({ select: { id: true, bodyEnc: true } });
  for (const m of messages) {
    const v = read(m.bodyEnc, fresh, stale);
    if (!v) {
      stats.unreadable++;
      lost.push(`Message ${m.id}`);
      continue;
    }
    if (!v.stale) {
      stats.fresh++;
      continue;
    }
    stats.rotated++;
    if (apply) {
      await prisma.message.update({ where: { id: m.id }, data: { bodyEnc: encrypt(v.text) } });
    }
  }
  console.log(`  Message   всего ${messages.length}`);

  console.log(
    `\nуже на текущем ключе: ${stats.fresh}` +
      `\n${apply ? 'перешифровано' : 'к перешифровке'}: ${stats.rotated}` +
      `\nне читается ни одним ключом: ${stats.unreadable}`,
  );

  if (lost.length) {
    console.log('\nНе восстановлены — задайте верный PII_ENCRYPTION_KEY_OLD:');
    for (const id of lost.slice(0, 20)) console.log(`  ${id}`);
    if (lost.length > 20) console.log(`  …и ещё ${lost.length - 20}`);
  }

  if (!apply && stats.rotated) console.log('\nНичего не записано. Повторите с --apply.');

  await prisma.$disconnect();
}

void main();
