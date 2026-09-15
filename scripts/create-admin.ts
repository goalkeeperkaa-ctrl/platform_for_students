import readline from 'node:readline';
import { PrismaClient } from '@prisma/client';
import { blindIndex, encrypt } from '../lib/security/crypto';
import { hashPassword } from '../lib/security/password';
import { emailSchema, passwordSchema } from '../lib/validation';

/**
 * Завести HR-менеджера (роль ADMIN).
 *
 *   npm run admin:create -- hr@fattakhov.ru
 *
 * Нужен потому, что `db:seed` создаёт демонстрационного админа с
 * заранее известным паролем, а сменить его в интерфейсе негде. На бою
 * сеять демо-данные нельзя — заводите учётную запись этой командой.
 *
 * Повторный запуск с той же почтой меняет пароль: это же и способ его
 * сбросить, если он потерян.
 */

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const mute = () => {
      readline.moveCursor(process.stdout, -1000, 0);
      readline.clearLine(process.stdout, 1);
      process.stdout.write(question);
    };
    process.stdin.on('data', mute);
    rl.question(question, (answer) => {
      process.stdin.off('data', mute);
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL не задан. Учётная запись нужна в базе, а не в памяти процесса.');
    process.exitCode = 1;
    return;
  }

  const raw = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!raw) {
    console.error('Укажите почту: npm run admin:create -- hr@fattakhov.ru');
    process.exitCode = 1;
    return;
  }

  const parsedEmail = emailSchema.safeParse(raw);
  if (!parsedEmail.success) {
    console.error(`Почта не подходит: ${parsedEmail.error.issues[0]?.message}`);
    process.exitCode = 1;
    return;
  }
  const email = parsedEmail.data;

  const password = (await askHidden(`Пароль для ${email}: `)).trim();
  const repeat = (await askHidden('Повторите пароль: ')).trim();

  if (password !== repeat) {
    console.error('Пароли не совпали.');
    process.exitCode = 1;
    return;
  }
  // Та же схема, что и на регистрации: у администратора требования
  // к паролю не могут быть мягче, чем у студента
  const parsedPassword = passwordSchema.safeParse(password);
  if (!parsedPassword.success) {
    console.error(`Пароль слабый: ${parsedPassword.error.issues[0]?.message}`);
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const emailHash = blindIndex(email);
    const passwordHash = await hashPassword(password);
    const existing = await prisma.account.findUnique({ where: { emailHash } });

    if (existing && existing.role !== 'ADMIN') {
      console.error('Эта почта уже занята учётной записью другой роли.');
      process.exitCode = 1;
      return;
    }

    await prisma.account.upsert({
      where: { emailHash },
      update: { passwordHash, isActive: true },
      create: { role: 'ADMIN', emailEnc: encrypt(email), emailHash, passwordHash, emailVerifiedAt: new Date() },
    });

    console.log(existing ? `\nПароль для ${email} обновлён.\n` : `\nHR-менеджер ${email} создан.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Не удалось:', error);
  process.exitCode = 1;
});
