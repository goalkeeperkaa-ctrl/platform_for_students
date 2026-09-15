/**
 * Проверка конфигурации при старте процесса.
 *
 * Без неё сервер поднимается «зелёным»: страница входа отдаётся, health
 * check проходит, балансировщик пускает трафик — и только потом каждое
 * действие возвращает 500. Ошибка при этом лежит в логе, но находят её
 * пользователи, а не тот, кто разворачивал.
 *
 * Поэтому отсутствие обязательной переменной в production — отказ
 * запуска, а не сломанная работа. Развёртывание падает сразу, на глазах
 * у того, кто может это починить.
 *
 * В разработке проверка не срабатывает намеренно: там пустой
 * DATABASE_URL означает демо-режим в памяти, и это законный сценарий.
 */

/** Переменные, без которых приложение не может работать в production. */
const REQUIRED: Array<{ name: string; why: string; minLength?: number }> = [
  {
    name: 'DATABASE_URL',
    why: 'демо-режим в памяти в production запрещён: данные не переживут рестарт',
  },
  {
    name: 'PII_ENCRYPTION_KEY',
    why: 'без него персональные данные нечем шифровать',
    minLength: 32,
  },
  {
    name: 'JWT_SECRET',
    why: 'без него нечем подписывать сессии',
    minLength: 32,
  },
  {
    name: 'APP_URL',
    why: 'без адреса платформы ссылки в письмах ведут на localhost',
  },
  {
    name: 'SMTP_URL',
    why: 'без почты не приходят коды подтверждения, ссылки сброса пароля и уведомления',
  },
  {
    name: 'SMTP_FROM',
    why: 'почтовый сервис не отправит письмо без адреса отправителя',
  },
];

export async function register(): Promise<void> {
  // Хук вызывается и для edge-рантайма, где нет ни process.exit, ни
  // доступа к базе: проверять там нечего
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV !== 'production') return;

  const problems = REQUIRED.flatMap(({ name, why, minLength }) => {
    const value = process.env[name];
    if (!value) return [`${name} не задан — ${why}`];
    if (minLength && value.length < minLength) {
      return [`${name} короче ${minLength} символов — ${why}`];
    }
    return [];
  });

  if (problems.length === 0) return;

  console.error(
    '\n[старт] запуск невозможен:\n' +
      problems.map((p) => `  · ${p}`).join('\n') +
      '\n\n  Ключи шифрования и подписи: npm run keys\n' +
      '  Строка подключения к базе:   npm run db:connect\n' +
      '  Почта (Yandex Cloud Postbox): ЗАПУСК.md, часть 7\n',
  );

  // Именно выход, а не throw: исключение из register() Next записывает в
  // лог и продолжает слушать порт — то есть оставляет ровно то
  // состояние, ради которого эта проверка и написана.
  process.exit(1);
}
