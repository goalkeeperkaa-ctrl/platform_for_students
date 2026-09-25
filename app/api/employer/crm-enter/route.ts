import { NextResponse } from 'next/server';
import { fail, handle } from '@/lib/api';
import { agencySiteUrl } from '@/lib/agency';
import { requireEmployer } from '@/lib/security/guards';
import { crmEntrySecret, issueCrmEntryTicket } from '@/lib/security/crm-ticket';
import { decryptSafe } from '@/lib/security/crypto';
import { getStore } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Переход в CRM для компании, уже объединённой с профилем там
 * (Employer.crmClientId) — тем же входом, без второго пароля. Билет
 * подписывает lib/security/crm-ticket.ts, принимает — CRM на
 * /api/auth/from-students (провайдер "students-entry" в её auth.ts).
 */
export async function GET() {
  return handle(async () => {
    const { employer } = await requireEmployer();
    if (!employer.crmClientId) {
      return fail(409, 'Профиль ещё не объединён с CRM', 'NOT_LINKED');
    }

    const secret = crmEntrySecret();
    const base = agencySiteUrl();
    if (!secret || !base) {
      return fail(503, 'Вход в CRM не настроен', 'SERVICE_NOT_CONFIGURED');
    }

    const store = await getStore();
    const account = await store.accounts.findById(employer.accountId);
    const email = account ? decryptSafe(account.emailEnc) : '';
    if (!email) return fail(500, 'Не удалось определить почту', 'INTERNAL');

    const ticket = issueCrmEntryTicket({ crmClientId: employer.crmClientId, email }, secret);
    return NextResponse.redirect(`${base}/api/auth/from-students?ticket=${encodeURIComponent(ticket)}`);
  });
}
