import { cookies } from 'next/headers';
import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { getStore, isAccountExistsError } from '@/lib/db';
import { STUDENT_CONSENT_VERSION, TERMS_VERSION } from '@/lib/legal';
import { audit, assertSameOrigin } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { HOME_BY_ROLE, SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/security/session';
import { registrationSchema } from '@/lib/validation';
import { track } from '@/lib/analytics';
import { sendEmailCode } from '@/lib/account-email';
import { COMPLETE_PROFILE_PERCENT, profileCompleteness } from '@/lib/portfolio';
import type { SessionUser } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);

    const ip = clientIp(request.headers);
    const limit = await rateLimit('register', ip);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const input = registrationSchema.parse(await request.json());
    const store = await getStore();

    // Вуз из справочника сверяется с базой, и название берётся оттуда, а не
    // из поля ввода: иначе «вышка» и «НИУ ВШЭ» считались бы разными вузами
    const institution = input.institutionId ? await store.institutions.findById(input.institutionId) : null;
    if (input.institutionId && !institution) {
      return fail(400, 'Вуз из списка не найден — выберите его заново на шаге «Где вы учитесь»', 'VALIDATION', {
        university: 'Выберите вуз из списка заново',
      });
    }

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
        university: institution ? (institution.shortName ?? institution.name) : input.university,
        institutionId: institution?.id ?? null,
        speciality: input.speciality,
        studyYear: input.studyYear,
        city: input.city,
        workDays: input.workDays,
        hoursPerWeek: input.hoursPerWeek,
        skills: input.skills,
        about: input.about,
        lookingFor: input.lookingFor,
        consentVersion: STUDENT_CONSENT_VERSION,
        consentIp: ip,
        termsVersion: TERMS_VERSION,
        marketingConsent: input.marketing,
      });

      const session: SessionUser = {
        accountId: account.id,
        role: 'STUDENT',
        profileId: student.id,
        name: input.fullName,
      };
      cookies().set(SESSION_COOKIE, await signSession(session), sessionCookieOptions);

      // Согласие на обработку ПДн фиксируется отдельным событием: это
      // юридический факт, а не деталь регистрации.
      await audit(session, {
        action: 'consent.granted',
        entity: 'Student',
        entityId: student.id,
        meta: { version: STUDENT_CONSENT_VERSION, terms: TERMS_VERSION, marketing: input.marketing },
      }, request.headers);
      await audit(session, { action: 'student.registered', entity: 'Student', entityId: student.id }, request.headers);
      await track('student.registered', { studentId: student.id });
      // Код подтверждения — сразу. Сбой почты регистрацию не отменяет:
      // код можно запросить заново из кабинета
      await sendEmailCode(account.id).catch((error: unknown) => console.error('[почта] код не отправлен:', error));
      if (profileCompleteness(student).percent >= COMPLETE_PROFILE_PERCENT) {
        await track('student.profile.completed', { studentId: student.id });
      }

      return ok({ redirectTo: HOME_BY_ROLE.STUDENT }, { status: 201 });
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
