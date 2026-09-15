import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { assertSameOrigin, audit, requireStudent } from '@/lib/security/guards';
import { rateLimit } from '@/lib/security/rate-limit';
import { swipeSchema, undoSwipeSchema } from '@/lib/validation';
import { isVacancyVisible } from '@/lib/vacancy';
import { track } from '@/lib/analytics';

export const runtime = 'nodejs';

/**
 * Свайп.
 *
 * Вправо — это и есть отклик: отдельной кнопки «откликнуться» в продукте
 * нет, поэтому запись свайпа и создание отклика обязаны происходить в
 * одном запросе. Разъехавшись, они дали бы студенту вакансию в
 * «Откликах», которой работодатель не видит.
 *
 * Исключение — студент, чью учёбу HR ещё не подтвердил. Его свайп вправо
 * сохраняется, но отклик не создаётся: работодатель видит только
 * проверенных студентов. Когда учёбу подтвердят, ожидающие отклики уйдут
 * сами (см. releasePendingApplications).
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { session, student, store } = await requireStudent();

    const limit = await rateLimit('swipe', student.id);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { vacancyId, direction } = swipeSchema.parse(await request.json());

    const vacancy = await store.vacancies.findById(vacancyId);
    // Та же проверка, что у ленты: вакансия на проверке или у компании,
    // которую вернули на модерацию, для студента не существует
    const employer = vacancy ? await store.employers.findById(vacancy.employerId) : null;
    if (!vacancy || !isVacancyVisible(vacancy, employer)) {
      return fail(404, 'Вакансия больше не активна', 'VACANCY_GONE');
    }

    await store.swipes.create({ studentId: student.id, vacancyId, direction });

    if (direction === 'RIGHT') {
      // Отклик, отправленный до того, как подтверждение сняли (сменился вуз),
      // остаётся откликом: работодатель уже видел этого студента
      const existing = student.studyVerified
        ? null
        : (await store.applications.listByStudent(student.id)).find((a) => a.vacancyId === vacancyId);

      if (!student.studyVerified && !existing) {
        await audit(session, { action: 'application.pending', entity: 'Vacancy', entityId: vacancyId }, request.headers);
        return ok({ applied: false, pending: true });
      }

      const application = await store.applications.upsert({ studentId: student.id, vacancyId });
      await track('application.created', {
        studentId: student.id,
        employerId: vacancy.employerId,
        vacancyId,
        applicationId: application.id,
      });
      // Первый отклик переводит студента в работу HR-менеджера
      if (student.status === 'ACTIVE') await store.students.setStatus(student.id, 'IN_PROGRESS');
      await audit(
        session,
        { action: 'application.created', entity: 'Application', entityId: application.id, meta: { vacancyId } },
        request.headers,
      );
      return ok({ applied: true, applicationId: application.id });
    }

    // Свайп влево, сделанный после отклика, отзывает отклик: иначе
    // работодатель продолжал бы видеть человека, который передумал.
    await store.applications.removeByPair(student.id, vacancyId);
    await audit(session, { action: 'vacancy.skipped', entity: 'Vacancy', entityId: vacancyId }, request.headers);
    return ok({ applied: false });
  });
}

/** Возврат вакансии в ленту из «Пропущенных» или отмена только что сделанного свайпа. */
export async function DELETE(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { session, student, store } = await requireStudent();
    const { vacancyId } = undoSwipeSchema.parse(await request.json());

    await store.swipes.remove(student.id, vacancyId);
    await store.applications.removeByPair(student.id, vacancyId);
    await audit(session, { action: 'swipe.undone', entity: 'Vacancy', entityId: vacancyId }, request.headers);

    return ok({ restored: true });
  });
}
