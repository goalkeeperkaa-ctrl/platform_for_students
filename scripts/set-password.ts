import readline from 'node:readline';
import { PrismaClient } from '@prisma/client';
import { blindIndex, decryptSafe } from '../lib/security/crypto';
import { hashPassword } from '../lib/security/password';
import { emailSchema, passwordSchema } from '../lib/validation';

/**
 * Задать новый пароль существующей учётной записи.
 *
 *   npm run password:set -- student@example.ru
 *
 * Зачем это нужно. Восстановления пароля по ссылке на платформе нет —
 * оно упирается в почтовый сервер, которого пока не настроили. Пока его
 * нет, человек, потерявший пароль, теряет учётную запись насовсем:
 * данные на месте, вход отвечает «неверная почта или пароль», и сделать
 * с этим нельзя ничего. Эта команда — то, чем поддержка закрывает такой
 * случай, пока не появится самостоятельное восстановление.
 *
 * Новую учётку она не заводит: пустая почта — это опечатка в аргументе,
 * а не повод создать человека. Для администратора есть admin:create.
 *
 * Работодателей команда не трогает: они входят по коду из CRM, пароля у
 * них нет вовсе. Новый код выдаёт employer:code.
 *
 * Факт смены пишется в журнал аудита. Смена пароля снаружи интерфейса —
 * ровно то событие, о котором потом спрашивают «кто и когда», и ответ на
 * это должен существовать.
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
    console.error('DATABASE_URL не задан: в памяти процесса менять нечего.');
    process.exitCode = 1;
    return;
  }

  const raw = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!raw) {
    console.error('Укажите почту: npm run password:set -- student@example.ru');
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

  const prisma = new PrismaClient();
  try {
    const account = await prisma.account.findUnique({
      where: { emailHash: blindIndex(email) },
      include: { student: { select: { id: true, fullNameEnc: true } } },
    });

    if (!account) {
      console.error(
        `Учётной записи с почтой ${email} нет.\n` +
          'Команда меняет пароль существующей, а не заводит новую.',
      );
      process.exitCode = 1;
      return;
    }

    if (account.role === 'EMPLOYER') {
      console.error(
        'Это работодатель — он входит по коду из CRM, пароля у него нет.\n' +
          'Новый код: npm run employer:code',
      );
      process.exitCode = 1;
      return;
    }

    const who = account.student
      ? decryptSafe(account.student.fullNameEnc, 'имя не читается')
      : 'HR-менеджер';
    console.log(`\nУчётная запись: ${email} · ${account.role} · ${who}`);
    console.log(`заведена: ${account.createdAt.toISOString().slice(0, 19)}`);
    console.log(
      `последний вход: ${account.lastLoginAt ? account.lastLoginAt.toISOString().slice(0, 19) : 'ни разу'}\n`,
    );

    const password = (await askHidden('Новый пароль: ')).trim();
    const repeat = (await askHidden('Повторите: ')).trim();

    if (password !== repeat) {
      console.error('Пароли не совпали.');
      process.exitCode = 1;
      return;
    }

    // Та же схема, что и на регистрации: пароль, заданный поддержкой,
    // не может быть слабее того, который человек задал бы себе сам
    const parsedPassword = passwordSchema.safeParse(password);
    if (!parsedPassword.success) {
      console.error(`Пароль слабый: ${parsedPassword.error.issues[0]?.message}`);
      process.exitCode = 1;
      return;
    }

    await prisma.account.update({
      where: { id: account.id },
      data: { passwordHash: await hashPassword(password), isActive: true },
    });

    await prisma.auditLog.create({
      data: {
        accountId: account.id,
        actorLabel: 'консоль сервера',
        action: 'auth.password.set',
        entity: 'Account',
        entityId: account.id,
        meta: { by: 'scripts/set-password' },
      },
    });

    console.log(`\nПароль для ${email} изменён. Войти можно сразу.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
