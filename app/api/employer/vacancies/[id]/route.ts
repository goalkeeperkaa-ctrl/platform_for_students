import { fail, handle, ok } from '@/lib/api';
import { notifyCrm } from '@/lib/notify-crm';
import {
  assertCompanyProfileComplete,
  assertEmailVerified,
  assertSameOrigin,
  audit,
  HttpError,
  requireEmployer,
} from '@/lib/security/guards';
import {
  SUBMITTABLE_STATUSES,
  statusAfterEdit,
  vacancyActionSchema,
  vacancyInputSchema,
  vacancySaveSchema,
} from '@/lib/vacancy';

export const runtime = 'nodejs';

type Params = { params: { id: string } };

/**
 * Своя вакансия, заведённая в кабинете.
 *
 * Чужая и несуществующая отвечают одинаково — 404: по разнице ответов
 * можно было бы перебирать идентификаторы чужих вакансий. Вакансию из CRM
 * кабинет не меняет: следующая синхронизация молча перезаписала бы правку.
 */
async function ownVacancy(id: string) {
  const context = await requireEmployer();
  const vacancy = await context.store.vacancies.findById(id);
  if (!vacancy || vacancy.employerId !== context.employer.id) {
    throw new HttpError(404, 'Вакансия не найдена', 'NOT_FOUND');
  }
  if (vacancy.crmId) {
    throw new HttpError(409, 'Эту вакансию ведёт агентство через CRM — изменения вносит оно', 'CRM_MANAGED');
  }
  return { ...context, vacancy };
}

/** Правка вакансии. Опубликованная после правки уходит на повторную проверку. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(request);
    const { session, employer, store, vacancy } = await ownVacancy(params.id);

    const body: unknown = await request.json();
    const { submit } = vacancySaveSchema.parse(body);
    const input = vacancyInputSchema.parse(body);
    if (submit) {
      await assertEmailVerified(session.accountId);
      assertCompanyProfileComplete(employer);
    }

    const status = statusAfterEdit(vacancy.status, submit);
    const justSubmitted = status === 'PENDING' && vacancy.status !== 'PENDING';
    const updated = await store.vacancies.update(vacancy.id, {
      ...input,
      status,
      // После правки вакансии в ленте нет ни в каком случае: она либо ещё
      // не публиковалась, либо ждёт повторной проверки
      isActive: false,
      submittedAt: justSubmitted ? new Date() : vacancy.submittedAt,
      // Отправлена повторно из CLOSED — уборка её больше не касается
      ...(justSubmitted && vacancy.status === 'CLOSED'
        ? { closedAt: null, keepAfterClose: null, lastCleanupReminderAt: null }
        : {}),
    });

    await audit(
      session,
      { action: 'vacancy.updated', entity: 'Vacancy', entityId: vacancy.id, meta: { from: vacancy.status, to: status } },
      request.headers,
    );

    if (justSubmitted) {
      await notifyCrm('vacancy', `Новая вакансия: ${employer.companyName}`, updated.title, updated.id);
    }

    return ok({ id: updated.id, status: updated.status });
  });
}

/** Действие над вакансией: отправить на проверку, снять или удалить. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(request);
    const { session, employer, store, vacancy } = await ownVacancy(params.id);
    const { action, keep } = vacancyActionSchema.parse(await request.json());

    if (action === 'close') {
      // Повторное нажатие — не ошибка: результат уже тот, что просили.
      // Решение сохранить/не сохранять при этом не переспрашиваем.
      if (vacancy.status === 'CLOSED') return ok({ id: vacancy.id, status: vacancy.status });
      const updated = await store.vacancies.update(vacancy.id, {
        status: 'CLOSED',
        isActive: false,
        closedAt: new Date(),
        keepAfterClose: keep === true,
        lastCleanupReminderAt: null,
      });
      await audit(
        session,
        { action: 'vacancy.closed', entity: 'Vacancy', entityId: vacancy.id, meta: { keep: keep === true } },
        request.headers,
      );
      return ok({ id: updated.id, status: updated.status });
    }

    if (action === 'delete') {
      if (vacancy.status !== 'CLOSED') {
        return fail(409, 'Удалить можно только снятую вакансию', 'NOT_CLOSED');
      }
      await store.vacancies.delete(vacancy.id);
      await audit(session, { action: 'vacancy.deleted', entity: 'Vacancy', entityId: vacancy.id }, request.headers);
      return ok({ id: vacancy.id, deleted: true });
    }

    if (vacancy.status === 'PENDING') return ok({ id: vacancy.id, status: vacancy.status });
    if (!SUBMITTABLE_STATUSES.includes(vacancy.status)) {
      return fail(409, 'Вакансия уже опубликована', 'ALREADY_PUBLISHED');
    }
    await assertEmailVerified(session.accountId);
    assertCompanyProfileComplete(employer);

    const updated = await store.vacancies.update(vacancy.id, {
      status: 'PENDING',
      isActive: false,
      submittedAt: new Date(),
      // Возвращается в оборот — уборка её больше не касается
      closedAt: null,
      keepAfterClose: null,
      lastCleanupReminderAt: null,
    });
    await audit(session, { action: 'vacancy.submitted', entity: 'Vacancy', entityId: vacancy.id }, request.headers);
    await notifyCrm('vacancy', `Новая вакансия: ${employer.companyName}`, updated.title, updated.id);
    return ok({ id: updated.id, status: updated.status });
  });
}
