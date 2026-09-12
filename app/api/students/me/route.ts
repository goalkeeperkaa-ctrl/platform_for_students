import { cookies } from 'next/headers';
import { handle, ok } from '@/lib/api';
import { studentName } from '@/lib/db/mappers';
import { assertSameOrigin, audit, requireStudent } from '@/lib/security/guards';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/security/session';
import { profileUpdateSchema } from '@/lib/validation';
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

    const updated = await store.students.update(student.id, {
      fullName: input.fullName,
      phone: input.phone || null,
      gender: input.gender,
      birthYear: input.birthYear,
      photoUrl: input.photoUrl,
      resumeUrl: input.resumeUrl,
      resumeName: input.resumeName,
      university: input.university,
      speciality: input.speciality,
      studyYear: input.studyYear,
      city: input.city || null,
      workDays: input.workDays,
      hoursPerWeek: input.hoursPerWeek,
      skills: input.skills,
      about: input.about || null,
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

    return ok({ name });
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
