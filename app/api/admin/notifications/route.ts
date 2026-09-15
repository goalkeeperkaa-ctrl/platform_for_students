import { fail, handle, ok } from '@/lib/api';
import { runNotificationJobs } from '@/lib/notify';
import { assertSameOrigin, audit, requireStaff } from '@/lib/security/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Разослать напоминания и сводки сейчас, не дожидаясь расписания.
 *
 * Поле at — момент, от которого считать, — принимается только в разработке:
 * сквозная проверка так проверяет сводку о сообщениях, не ожидая десять минут.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireStaff('students');

    const body = (await request.json().catch(() => ({}))) as { at?: unknown };
    const at = process.env.NODE_ENV !== 'production' && typeof body.at === 'string' ? new Date(body.at) : new Date();
    if (Number.isNaN(at.getTime())) return fail(400, 'Некорректная дата', 'VALIDATION');

    const result = await runNotificationJobs(at);
    await audit(session, { action: 'notifications.run', meta: { ...result } }, request.headers);
    return ok(result);
  });
}
