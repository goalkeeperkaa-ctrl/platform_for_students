import { cookies } from 'next/headers';
import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { AccountExistsError, getStore } from '@/lib/db';
import { CONSENT_VERSION } from '@/lib/db/seed-data';
import { audit, assertSameOrigin } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { HOME_BY_ROLE, SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/security/session';
import { registrationSchema } from '@/lib/validation';
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

    try {
      const { account, student } = await store.students.createWithAccount({
        email: input.email,
        password: input.password,
        fullName: input.fullName,
        phone: input.phone,
        gender: input.gender,
        birthYear: input.birthYear,
        photoUrl: input.photoUrl,
        resumeUrl: input.resumeUrl,
        resumeName: input.resumeName,
        university: input.university,
        speciality: input.speciality,
        studyYear: input.studyYear,
        city: input.city,
        workDays: input.workDays,
        hoursPerWeek: input.hoursPerWeek,
        skills: input.skills,
        about: input.about,
        lookingFor: input.lookingFor,
        consentVersion: CONSENT_VERSION,
        consentIp: ip,
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
        meta: { version: CONSENT_VERSION },
      }, request.headers);
      await audit(session, { action: 'student.registered', entity: 'Student', entityId: student.id }, request.headers);

      return ok({ redirectTo: HOME_BY_ROLE.STUDENT }, { status: 201 });
    } catch (err) {
      if (err instanceof AccountExistsError) {
        return fail(409, 'Аккаунт с такой почтой уже зарегистрирован', 'EMAIL_TAKEN', {
          email: 'Эта почта уже занята',
        });
      }
      throw err;
    }
  });
}
