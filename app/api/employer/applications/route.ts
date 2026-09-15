import { fail, handle, ok } from '@/lib/api';
import { assertSameOrigin, audit, requireEmployer } from '@/lib/security/guards';
import { buildEmployerBoard } from '@/lib/services';
import { applicationStatusSchema } from '@/lib/validation';
import { NEXT_STEP_STATUSES, track } from '@/lib/analytics';
import { notifyApplicationStatus } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    const { employer } = await requireEmployer();
    return ok(await buildEmployerBoard(employer.id));
  });
}

/** Смена статуса отклика работодателем. */
export async function PATCH(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { session, employer, store } = await requireEmployer();
    const { applicationId, status, note } = applicationStatusSchema.parse(await request.json());

    // Работодатель может двигать только свои отклики. Проверка по владельцу
    // вакансии, а не по переданному id: id приходит от клиента.
    const application = await store.applications.findById(applicationId);
    if (!application) return fail(404, 'Отклик не найден', 'NOT_FOUND');
    const vacancy = await store.vacancies.findById(application.vacancyId);
    if (!vacancy || vacancy.employerId !== employer.id) {
      return fail(403, 'Отклик относится к чужой вакансии', 'FORBIDDEN');
    }

    const updated = await store.applications.setStatus(applicationId, status, note ?? undefined);

    // Статус отклика тянет за собой статус студента: вышел на работу —
    // значит, он больше не в поиске, и HR-менеджер не должен его дёргать.
    if (status === 'HIRED') await store.students.setStatus(application.studentId, 'PLACED');

    // Приглашение, собеседование, выход — возможность, которую студент получил
    // через платформу. Повторное нажатие того же статуса событием не считается
    if (NEXT_STEP_STATUSES.includes(status) && application.status !== status) {
      await track('application.next_step', {
        studentId: application.studentId,
        employerId: employer.id,
        vacancyId: vacancy.id,
        applicationId,
      });
    }

    await audit(
      session,
      { action: 'application.status', entity: 'Application', entityId: applicationId, meta: { status } },
      request.headers,
    );
    if (application.status !== status) await notifyApplicationStatus(application, status);

    return ok({ application: updated });
  });
}
