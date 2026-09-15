import { fail, handle, ok } from '@/lib/api';
import { track } from '@/lib/analytics';
import { assertSameOrigin, audit, requireEmployer } from '@/lib/security/guards';
import { applicationViewSchema } from '@/lib/validation';
import { notifyApplicationStatus } from '@/lib/notify';

export const runtime = 'nodejs';

/**
 * Работодатель открыл карточку кандидата.
 *
 * Новый отклик становится «просмотренным»: студент видит, что его заметили,
 * — часто это первый ответ, который он получает. Повторное открытие ничего
 * не меняет и событий не пишет: в метриках считается первый просмотр, а не
 * то, сколько раз карточку разворачивали.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { session, employer, store } = await requireEmployer();
    const { applicationId } = applicationViewSchema.parse(await request.json());

    const application = await store.applications.findById(applicationId);
    if (!application) return fail(404, 'Отклик не найден', 'NOT_FOUND');
    const vacancy = await store.vacancies.findById(application.vacancyId);
    if (!vacancy || vacancy.employerId !== employer.id) {
      return fail(403, 'Отклик относится к чужой вакансии', 'FORBIDDEN');
    }

    if (application.status !== 'NEW') return ok({ id: application.id, status: application.status });

    const updated = await store.applications.setStatus(applicationId, 'VIEWED');
    await audit(
      session,
      {
        action: 'application.status',
        entity: 'Application',
        entityId: applicationId,
        meta: { status: 'VIEWED', auto: true },
      },
      request.headers,
    );
    await track('profile.viewed', {
      studentId: application.studentId,
      employerId: employer.id,
      vacancyId: vacancy.id,
      applicationId,
    });

    await notifyApplicationStatus(application, 'VIEWED');

    return ok({ id: applicationId, status: updated?.status ?? 'VIEWED' });
  });
}
