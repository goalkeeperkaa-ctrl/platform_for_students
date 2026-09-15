import { fail, handle, ok } from '@/lib/api';
import { getStore } from '@/lib/db';
import { assertSameOrigin, getSession } from '@/lib/security/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Видел ли человек инструкцию. Отметка хранится в учётной записи, а не в
 * браузере: иначе тур показывался бы заново на каждом новом устройстве.
 */
export async function GET() {
  return handle(async () => {
    const session = await getSession();
    if (!session) return fail(401, 'Требуется вход в систему', 'UNAUTHORIZED');
    const store = await getStore();
    const account = await store.accounts.findById(session.accountId);
    return ok({ seen: !!account?.tourSeenAt, role: session.role });
  });
}

/** Инструкция пройдена или закрыта — больше сама не открывается. */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await getSession();
    if (!session) return fail(401, 'Требуется вход в систему', 'UNAUTHORIZED');
    const store = await getStore();
    await store.accounts.markTourSeen(session.accountId);
    return ok({ seen: true });
  });
}
