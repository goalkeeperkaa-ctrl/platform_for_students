import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { handle, tooManyRequests } from '@/lib/api';
import { getStore } from '@/lib/db';
import { blindIndex } from '@/lib/security/crypto';
import { audit } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/security/session';
import { staffSsoSecret, verifyStaffTicket, type ClientTicket, type StaffTicket } from '@/lib/security/staff-ticket';
import { STAFF_SESSION_SECONDS, staffHome } from '@/lib/staff-permissions';
import type { SessionUser } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LoginFailReason = 'config' | 'expired' | 'used' | 'conflict' | 'disabled';

/** На вход с пояснением. Причины — в LoginForm (параметр crm). */
function toLogin(request: Request, reason: LoginFailReason) {
  return NextResponse.redirect(new URL(`/login?crm=${reason}`, request.url), 303);
}

/**
 * Вход сотрудника агентства из CRM.
 *
 * Учётка заводится по почте сотрудника при первом входе — без пароля:
 * войти ею можно только снова через CRM. Почта, занятая студентом или
 * компанией, входом в панель не становится.
 */
async function signInStaff(request: Request, ticket: StaffTicket): Promise<NextResponse | LoginFailReason> {
  const store = await getStore();
  const emailHash = blindIndex(ticket.email);
  let account = await store.accounts.findByEmailHash(emailHash);
  if (account && account.role !== 'ADMIN') return 'conflict';
  if (account && !account.isActive) return 'disabled';
  if (!account) {
    // Два одновременных входа одного сотрудника: вторая попытка найдёт учётку первой
    account = await store.accounts.createStaff(ticket.email).catch(async (error: unknown) => {
      const existing = await store.accounts.findByEmailHash(emailHash);
      if (existing?.role === 'ADMIN') return existing;
      throw error;
    });
  }

  const session: SessionUser = {
    accountId: account.id,
    role: 'ADMIN',
    profileId: null,
    name: ticket.name,
    permissions: ticket.permissions,
  };
  cookies().set(SESSION_COOKIE, await signSession(session, STAFF_SESSION_SECONDS), {
    ...sessionCookieOptions,
    maxAge: STAFF_SESSION_SECONDS,
  });
  await store.accounts.touchLogin(account.id);
  await audit(
    session,
    {
      action: 'auth.crm',
      entity: 'Account',
      entityId: account.id,
      meta: { crmUserId: ticket.sub, position: ticket.position, permissions: ticket.permissions },
    },
    request.headers,
  );

  return NextResponse.redirect(new URL(staffHome(ticket.permissions), request.url), 303);
}

/**
 * Вход представителя клиента CRM — публикация вакансии от имени компании,
 * которую агентство уже проверило договором (Employer.crmClientId).
 *
 * Компания на всех вошедших одна: кто из сотрудников клиента зашёл первым,
 * заводит её, остальные далее входят в тот же кабинет.
 */
async function signInClient(request: Request, ticket: ClientTicket): Promise<NextResponse> {
  const store = await getStore();
  const employer = await store.employers.ensureForCrmClient({
    crmClientId: ticket.crmClientId,
    companyName: ticket.companyName,
    contactName: ticket.contactName,
    contactEmail: ticket.contactEmail,
  });

  const session: SessionUser = {
    accountId: employer.accountId,
    role: 'EMPLOYER',
    profileId: employer.id,
    name: employer.companyName,
  };
  cookies().set(SESSION_COOKIE, await signSession(session, STAFF_SESSION_SECONDS), {
    ...sessionCookieOptions,
    maxAge: STAFF_SESSION_SECONDS,
  });
  await store.accounts.touchLogin(employer.accountId);
  await audit(
    session,
    {
      action: 'auth.crm.client',
      entity: 'Employer',
      entityId: employer.id,
      meta: { crmClientId: ticket.crmClientId, crmUserId: ticket.sub },
    },
    request.headers,
  );

  return NextResponse.redirect(new URL('/employer/vacancies/new', request.url), 303);
}

/**
 * Билет подписан общим секретом (CRM), живёт минуту и гасится при входе —
 * второй раз по нему не войти. Разбирает оба вида билета, которые CRM
 * выпускает: сотрудник агентства и представитель клиента.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const limit = await rateLimit('crmTicket', clientIp(request.headers));
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const secret = staffSsoSecret();
    if (!secret) return toLogin(request, 'config');

    const checked = verifyStaffTicket(new URL(request.url).searchParams.get('ticket') ?? '', secret);
    if (!checked.ok) {
      await audit(null, { action: 'auth.crm.failed', meta: { reason: checked.reason } }, request.headers);
      return toLogin(request, 'expired');
    }
    const { ticket } = checked;

    const store = await getStore();
    if (!(await store.staffTickets.consume(ticket.jti))) {
      await audit(null, { action: 'auth.crm.replayed', meta: { crmUserId: ticket.sub } }, request.headers);
      return toLogin(request, 'used');
    }

    const result =
      ticket.kind === 'client' ? await signInClient(request, ticket) : await signInStaff(request, ticket);
    return typeof result === 'string' ? toLogin(request, result) : result;
  });
}
