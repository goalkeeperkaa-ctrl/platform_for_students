/**
 * Напоминания и сводки о сообщениях на почту.
 *
 *   npm run notify:run              один проход — для cron раз в 10–15 минут
 *   npm run notify:run -- --loop    повторяет сам каждые 10 минут
 *
 * Повторный проход уже отправленного не шлёт: отметки лежат в базе.
 */

// Клиент Prisma при импорте подхватывает .env — без этого хранилище решило
// бы, что базы нет, и запустилось бы в памяти
import '@prisma/client';
import { runNotificationJobs } from '../lib/notify';

const INTERVAL_MS = 10 * 60_000;

async function once() {
  const result = await runNotificationJobs();
  console.log(
    `[напоминания] ${new Date().toISOString()} · справка: ${result.studyDeadline} · ` +
      `отклики: ${result.pendingExpiry} · сводки о сообщениях: ${result.messageDigests}`,
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL не задан. Напоминания рассылаются по базе, а не по памяти процесса.');
    process.exitCode = 1;
    return;
  }
  await once();
  if (!process.argv.includes('--loop')) return;
  setInterval(() => {
    once().catch((error) => console.error('[напоминания] проход не удался:', error));
  }, INTERVAL_MS);
}

main().catch((error) => {
  console.error('Не удалось:', error);
  process.exitCode = 1;
});
