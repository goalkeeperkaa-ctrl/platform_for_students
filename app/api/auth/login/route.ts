import { cookies } from 'next/headers';
import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { getStore } from '@/lib/db';
import { studentName } from '@/lib/db/mappers';
import { audit, assertSameOrigin } from '@/lib/security/guards';
import { blindIndex } from '@/lib/security/crypto';
import { verifyPassword } from '@/lib/security/password';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { HOME_BY_ROLE, SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/security/session';
import { loginSchema } from '@/lib/validation';
import type { SessionUser } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);

    const ip = clientIp(request.headers);
    const input = loginSchema.parse(await request.json());

    // Лимит и по IP, и по учётной записи: первый режет шквал с одной
    // машины, второй — распределённый перебор одного аккаунта.
    // Пороги у них разные: за адресом может стоять целый кампус, а за
    // учётной записью — ровно один человек, и защищать надо её.
    const byIp = await rateLimit('loginIp', ip);
    if (!byIp.ok) return tooManyRequests(byIp.retryAfter);
    const emailHash = blindIndex(input.email);
    const byAccount = await rateLimit('login', `acct:${emailHash}`);
    if (!byAccount.ok) return tooManyRequests(byAccount.retryAfter);

    const store = await getStore();
    const account = await store.accounts.findByEmailHash(emailHash);

    // Пароль сверяется даже при отсутствии аккаунта: иначе разница во
    // времени ответа выдаёт, какие адреса зарегистрированы.
    const passwordOk = await verifyPassword(input.password, account?.passwordHash);

    // Работодатель из CRM пароля не имеет и входит по коду — verifyPassword
    // для него вернёт false. Компания, зарегистрировавшаяся сама, пароль
    // задала и входит здесь же, как студент.
    if (!account || !passwordOk || !account.isActive) {
      await audit(null, { action: 'auth.login.failed', meta: { emailHash } }, request.headers);
      return fail(401, 'Неверная почта или пароль', 'BAD_CREDENTIALS');
    }

    let profileId: string | null = null;
    let name = 'Администратор';
    if (account.role === 'EMPLOYER') {
      const employer = await store.employers.findByAccountId(account.id);
      profileId = employer?.id ?? null;
      name = employer?.companyName ?? 'Работодатель';
    }
    if (account.role === 'STUDENT') {
      const student = await store.students.findByAccountId(account.id);
      profileId = student?.id ?? null;
      name = student ? studentName(student) : 'Студент';
    }

    const session: SessionUser = { accountId: account.id, role: account.role, profileId, name };
    cookies().set(SESSION_COOKIE, await signSession(session), sessionCookieOptions);
    await store.accounts.touchLogin(account.id);
    await audit(session, { action: 'auth.login', entity: 'Account', entityId: account.id }, request.headers);

    return ok({ redirectTo: HOME_BY_ROLE[account.role], role: account.role });
  });
}
