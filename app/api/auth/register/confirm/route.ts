import { cookies } from 'next/headers';
import { z } from 'zod';
import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { track } from '@/lib/analytics';
import { getStore, isAccountExistsError } from '@/lib/db';
import { STUDENT_CONSENT_VERSION, TERMS_VERSION } from '@/lib/legal';
import { confirmPendingRegistration, type PendingStudentData } from '@/lib/pending-registration';
import { COMPLETE_PROFILE_PERCENT, profileCompleteness } from '@/lib/portfolio';
import { audit, assertSameOrigin } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { HOME_BY_ROLE, SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/security/session';
import { emailCodeSchema } from '@/lib/validation';
import type { SessionUser } from '@/lib/types';

export const runtime = 'nodejs';

const confirmSchema = z.object({ pending: z.string().min(1).max(4000) }).merge(emailCodeSchema);

/** Регистрация студента, шаг 2: верный код создаёт учётную запись и открывает сессию. */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);

    const limit = await rateLimit('registerConfirm', clientIp(request.headers));
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { pending, code } = confirmSchema.parse(await request.json());
    const result = await confirmPendingRegistration<PendingStudentData>('student', pending, code);

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
      const { account, student } = await store.students.createWithAccount({
        email: input.email,
        password: input.password,
        fullName: input.fullName,
        phone: input.phone,
        gender: input.gender,
        birthYear: Number(input.birthDate.slice(0, 4)),
        birthDate: input.birthDate,
        photoUrl: input.photoUrl,
        resumeUrl: input.resumeUrl,
        resumeName: input.resumeName,
        university: input.university,
        institutionId: input.institutionId ?? null,
        speciality: input.speciality,
        studyYear: input.studyYear,
        city: input.city,
        workDays: input.workDays,
        hoursPerWeek: input.hoursPerWeek,
        skills: input.skills,
        about: input.about,
        lookingFor: input.lookingFor,
        consentVersion: STUDENT_CONSENT_VERSION,
        consentIp: input.consentIp,
        termsVersion: TERMS_VERSION,
        marketingConsent: input.marketing,
      });

      // Почта только что подтверждена кодом — учётная запись стартует уже верифицированной
      await store.accounts.markEmailVerified(account.id);

      const session: SessionUser = {
        accountId: account.id,
        role: 'STUDENT',
        profileId: student.id,
        name: input.fullName,
      };
      cookies().set(SESSION_COOKIE, await signSession(session), sessionCookieOptions);

      await audit(
        session,
        {
          action: 'consent.granted',
          entity: 'Student',
          entityId: student.id,
          meta: { version: STUDENT_CONSENT_VERSION, terms: TERMS_VERSION, marketing: input.marketing },
        },
        request.headers,
      );
      await audit(session, { action: 'student.registered', entity: 'Student', entityId: student.id }, request.headers);
      await track('student.registered', { studentId: student.id });
      if (profileCompleteness(student).percent >= COMPLETE_PROFILE_PERCENT) {
        await track('student.profile.completed', { studentId: student.id });
      }

      return ok({ redirectTo: HOME_BY_ROLE.STUDENT }, { status: 201 });
    } catch (err) {
      if (isAccountExistsError(err)) {
        return fail(409, 'Аккаунт с такой почтой уже зарегистрирован — начните регистрацию заново', 'EMAIL_TAKEN');
      }
      throw err;
    }
  });
}
