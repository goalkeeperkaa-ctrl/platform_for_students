import { cookies } from 'next/headers';
import { fail, handle, ok } from '@/lib/api';
import { studentName } from '@/lib/db/mappers';
import { assertSameOrigin, audit, requireStudent } from '@/lib/security/guards';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/security/session';
import { profileUpdateSchema } from '@/lib/validation';
import { track } from '@/lib/analytics';
import { COMPLETE_PROFILE_PERCENT, profileCompleteness } from '@/lib/portfolio';
import { releasePendingApplications } from '@/lib/services';
import { EDUCATION_PLACEHOLDER, EDUCATION_PLACEHOLDER_YEAR, hasEducation } from '@/lib/study';
import type { SessionUser } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * Свой профиль: изменить и удалить.
 *
 * Ни в одном из обработчиков нет идентификатора студента из запроса —
 * он берётся из сессии. Приняв его снаружи, пришлось бы сверять права
 * на каждой ветке, и однажды сверка потерялась бы: чужой профиль правят
 * подстановкой чужого id, это первое, что пробуют.
 */

export async function PATCH(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { session, student, store } = await requireStudent();

    const input = profileUpdateSchema.parse(await request.json());

    // undefined — клиент, который про справочник не знает: вуз из
    // справочника остаётся, пока не изменилось название
    const requestedInstitution =
      input.institutionId === undefined
        ? input.university === student.university
          ? student.institutionId
          : null
        : input.institutionId;
    const institution = requestedInstitution ? await store.institutions.findById(requestedInstitution) : null;
    if (requestedInstitution && !institution) {
      return fail(400, 'Проверьте заполнение полей', 'VALIDATION', { university: 'Выберите вуз из списка заново' });
    }
    const university = institution
      ? (institution.shortName ?? institution.name)
      : (input.university ?? EDUCATION_PLACEHOLDER);

    // Подтверждали учёбу в конкретном вузе: сменился вуз — отметка больше
    // ни о чём не говорит
    const resetVerification =
      student.studyVerified &&
      ((institution?.id ?? null) !== student.institutionId || university !== student.university);

    const updated = await store.students.update(student.id, {
      fullName: input.fullName,
      phone: input.phone || null,
      gender: input.gender,
      birthYear: Number(input.birthDate.slice(0, 4)),
      birthDate: input.birthDate,
      photoUrl: input.photoUrl,
      resumeUrl: input.resumeUrl,
      resumeName: input.resumeName,
      university,
      institutionId: institution?.id ?? null,
      studyVerified: resetVerification ? false : undefined,
      speciality: input.speciality ?? EDUCATION_PLACEHOLDER,
      studyYear: input.studyYear ?? EDUCATION_PLACEHOLDER_YEAR,
      city: input.city || null,
      workDays: input.workDays,
      hoursPerWeek: input.hoursPerWeek,
      skills: input.skills,
      about: input.about || null,
      // Портфолио — только пришедшее: undefined значит «не менять»
      lookingFor: input.lookingFor,
      goals: input.goals,
      projects: input.projects,
      achievements: input.achievements,
      activities: input.activities,
      hobbies: input.hobbies,
      links: input.links,
      videoUrl: input.videoUrl,
    });

    // Имя лежит в сессионном токене — шапка берёт его оттуда, а не из
    // базы. Без переподписи человек меняет имя и до конца срока куки
    // видит в углу старое, решая, что ничего не сохранилось.
    const name = studentName(updated);
    if (name !== session.name) {
      const next: SessionUser = { ...session, name };
      cookies().set(SESSION_COOKIE, await signSession(next), sessionCookieOptions);
    }

    await audit(
      session,
      { action: 'student.profile.updated', entity: 'Student', entityId: student.id },
      request.headers,
    );
    if (resetVerification) {
      await audit(session, { action: 'student.study.reset', entity: 'Student', entityId: student.id }, request.headers);
    }
    // Событие — в момент, когда профиль впервые перешёл порог заполненности
    if (
      profileCompleteness(student).percent < COMPLETE_PROFILE_PERCENT &&
      profileCompleteness(updated).percent >= COMPLETE_PROFILE_PERCENT
    ) {
      await track('student.profile.completed', { studentId: student.id });
    }

    // Вуз/специальность/курс дозаполнили только что — отклики, ждавшие
    // именно этого, уходят работодателям сразу, а не только после
    // следующего подтверждения учёбы или почты
    if (!hasEducation(student) && hasEducation(updated)) {
      await releasePendingApplications(student.id);
    }

    return ok({ name, studyVerified: updated.studyVerified });
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { session, student, store } = await requireStudent();

    // Пишем в журнал до удаления, а не после: после — уже нечем
    // связать запись с человеком, а сам факт удаления обязан остаться
    // (152-ФЗ, отзыв согласия на обработку).
    await audit(
      session,
      {
        action: 'student.profile.deleted',
        entity: 'Student',
        entityId: student.id,
        meta: { consentVersion: student.consentVersion },
      },
      request.headers,
    );

    await store.students.deleteByAccountId(session.accountId);

    // Куку снимаем здесь же: сессия ссылается на учётную запись,
    // которой больше нет, и без этого следующий переход упёрся бы
    // в «профиль не найден» вместо чистого выхода.
    cookies().delete(SESSION_COOKIE);

    return ok({ deleted: true });
  });
}
