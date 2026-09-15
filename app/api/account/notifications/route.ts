import { handle, ok } from '@/lib/api';
import { getStore } from '@/lib/db';
import { assertSameOrigin, audit, requireRole } from '@/lib/security/guards';
import { notificationSettingsSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Напоминания и сводки о сообщениях на почту: включены ли. */
export async function GET() {
  return handle(async () => {
    const session = await requireRole('STUDENT', 'EMPLOYER');
    const account = await (await getStore()).accounts.findById(session.accountId);
    return ok({ email: account?.notifyEmail ?? true });
  });
}

/** Включить или отключить. Письма о решениях HR и работодателей это не отключает. */
export async function PATCH(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireRole('STUDENT', 'EMPLOYER');
    const { email } = notificationSettingsSchema.parse(await request.json());

    await (await getStore()).accounts.setNotifyEmail(session.accountId, email);
    await audit(
      session,
      { action: 'account.notifications', entity: 'Account', entityId: session.accountId, meta: { email } },
      request.headers,
    );
    return ok({ email });
  });
}
