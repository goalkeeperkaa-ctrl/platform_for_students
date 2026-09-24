import { cookies } from 'next/headers';
import { z } from 'zod';
import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { track } from '@/lib/analytics';
import { COMPANY_PLACEHOLDER } from '@/lib/company';
import { getStore, isAccountExistsError, isInnExistsError } from '@/lib/db';
import { COMPANY_CONSENT_VERSION, TERMS_VERSION } from '@/lib/legal';
import { confirmPendingRegistration, type PendingEmployerData } from '@/lib/pending-registration';
import { audit, assertSameOrigin } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/security/session';
import { emailCodeSchema } from '@/lib/validation';
import type { SessionUser } from '@/lib/types';

export const runtime = 'nodejs';

const confirmSchema = z.object({ pending: z.string().min(1).max(4000) }).merge(emailCodeSchema);

/** Регистрация компании, шаг 2: верный код открывает кабинет. */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);

    const limit = await rateLimit('registerConfirm', clientIp(request.headers));
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { pending, code } = confirmSchema.parse(await request.json());
    const result = await confirmPendingRegistration<PendingEmployerData>('employer', pending, code);

    if (result.status === 'WRONG') {
      return ok(
        { error: `Неверный код. Осталось попыток: ${result.attemptsLeft}`, code: 'WRONG_CODE', pending: result.token },
        { status: 400 },
      );
    }
    if (result.status === 'LOCKED') {
      return fail(429, 'Слишком много попыток. Начните регистрацию заново.', 'CODE_LOCKED');
    }
    if (result.status === 'BAD_TOKEN') {
      return fail(410, 'Время на подтверждение истекло. Начните регистрацию заново.', 'CODE_EXPIRED');
    }

    const input = result.data;
    const store = await getStore();

    try {
      const { account, employer } = await store.employers.createWithAccount({
        email: input.email,
        password: input.password,
        // Название, контакт и ИНН теперь дозаполняются в кабинете — если
        // ещё не заполнены, пишем плейсхолдер вместо NULL (колонки в базе
        // обязательные)
        companyName: input.companyName ?? COMPANY_PLACEHOLDER,
        contactName: input.contactName ?? COMPANY_PLACEHOLDER,
        city: input.city,
        inn: input.inn,
        phone: input.phone,
        consentVersion: COMPANY_CONSENT_VERSION,
        termsVersion: TERMS_VERSION,
        marketingConsent: input.marketing,
      });

      await store.accounts.markEmailVerified(account.id);

      const session: SessionUser = {
        accountId: account.id,
        role: 'EMPLOYER',
        profileId: employer.id,
        name: employer.companyName || 'Новая компания',
      };
      cookies().set(SESSION_COOKIE, await signSession(session), sessionCookieOptions);

      await audit(
        session,
        {
          action: 'consent.granted',
          entity: 'Employer',
          entityId: employer.id,
          meta: { version: COMPANY_CONSENT_VERSION, terms: TERMS_VERSION, marketing: input.marketing },
        },
        request.headers,
      );
      await audit(session, { action: 'employer.registered', entity: 'Employer', entityId: employer.id }, request.headers);
      await track('company.registered', { employerId: employer.id });

      return ok({ redirectTo: '/employer/company', moderationStatus: employer.moderationStatus }, { status: 201 });
    } catch (err) {
      if (isInnExistsError(err)) {
        return fail(409, 'Компания с таким ИНН уже зарегистрирована — если это ваша компания, напишите в агентство', 'INN_TAKEN');
      }
      if (isAccountExistsError(err)) {
        return fail(409, 'Аккаунт с такой почтой уже зарегистрирован — начните регистрацию заново', 'EMAIL_TAKEN');
      }
      throw err;
    }
  });
}
