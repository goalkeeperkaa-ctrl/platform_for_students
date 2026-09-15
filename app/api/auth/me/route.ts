import { handle, ok } from '@/lib/api';
import { getStore } from '@/lib/db';
import { getSession } from '@/lib/security/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    const session = await getSession();
    if (!session) return ok({ session: null, account: null });
    // Подтверждённость почты — из базы, а не из сессии: подпись куки живёт
    // две недели и о подтверждении, случившемся после входа, не знает
    const account = await (await getStore()).accounts.findById(session.accountId);
    return ok({
      session,
      account: account ? { emailVerified: Boolean(account.emailVerifiedAt), notifyEmail: account.notifyEmail } : null,
    });
  });
}
