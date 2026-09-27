import { fail, handle, ok } from '@/lib/api';
import { runNotificationJobs } from '@/lib/notify';
import { safeEqual } from '@/lib/security/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Плановый прогон напоминаний и уборки — раз в день по расписанию из
 * vercel.json. Vercel сам подставляет CRON_SECRET в Authorization, если
 * переменная так называется — сторонний вызов с любым другим токеном
 * получит 401, без секрета в окружении роут отвечает 503 и ничего не шлёт.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return fail(503, 'CRON_SECRET не настроен', 'SERVICE_NOT_CONFIGURED');

    const header = request.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !safeEqual(token, secret)) {
      return fail(401, 'Неверный токен планировщика', 'UNAUTHORIZED');
    }

    const result = await runNotificationJobs();
    return ok(result);
  });
}
