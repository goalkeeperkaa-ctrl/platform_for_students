import { cookies } from 'next/headers';
import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { getStore, isAccountExistsError } from '@/lib/db';
import { COMPANY_CONSENT_VERSION, companyRegistrationSchema } from '@/lib/company';
import { audit, assertSameOrigin } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/security/session';
import type { SessionUser } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * Самостоятельная регистрация компании.
 *
 * Компания сразу получает кабинет: заполнить страницу и подготовить
 * вакансии можно, не дожидаясь агентства. Студентам она не видна, пока
 * её не одобрит HR, — статус «на модерации» выставляет хранилище, и
 * подменить его полем запроса нельзя.
 *
 * Лимит тот же, что у регистрации студента: одна дверь для массовых
 * регистраций не должна быть шире другой.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);

    const ip = clientIp(request.headers);
    const limit = await rateLimit('register', ip);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const input = companyRegistrationSchema.parse(await request.json());
    const store = await getStore();

    try {
      const { account, employer } = await store.employers.createWithAccount({
        email: input.email,
        password: input.password,
        companyName: input.companyName,
        contactName: input.contactName,
        industry: input.industry,
        city: input.city,
        consentVersion: COMPANY_CONSENT_VERSION,
      });

      const session: SessionUser = {
        accountId: account.id,
        role: 'EMPLOYER',
        profileId: employer.id,
        name: employer.companyName,
      };
      cookies().set(SESSION_COOKIE, await signSession(session), sessionCookieOptions);

      // Согласие контактного лица — отдельным событием: юридический факт,
      // а не деталь регистрации. IP события запишет журнал.
      await audit(
        session,
        {
          action: 'consent.granted',
          entity: 'Employer',
          entityId: employer.id,
          meta: { version: COMPANY_CONSENT_VERSION },
        },
        request.headers,
      );
      await audit(
        session,
        { action: 'employer.registered', entity: 'Employer', entityId: employer.id },
        request.headers,
      );

      // Сразу на страницу компании: без неё студент увидит пустую карточку
      return ok({ redirectTo: '/employer/company', moderationStatus: employer.moderationStatus }, { status: 201 });
    } catch (err) {
      if (isAccountExistsError(err)) {
        return fail(409, 'Аккаунт с такой почтой уже зарегистрирован', 'EMAIL_TAKEN', {
          email: 'Эта почта уже занята',
        });
      }
      throw err;
    }
  });
}
