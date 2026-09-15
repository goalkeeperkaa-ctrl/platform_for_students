import { fail, handle, ok } from '@/lib/api';
import { getStore } from '@/lib/db';
import { assertSameOrigin, audit, requireStaff } from '@/lib/security/guards';
import { buildModerationQueue } from '@/lib/services';
import { moderationDecisionSchema, vacancyContentOf } from '@/lib/vacancy';
import { track } from '@/lib/analytics';
import { notifyCompanyDecision, notifyVacancyDecision } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Очередь модерации: компании и вакансии, ждущие решения. */
export async function GET() {
  return handle(async () => {
    await requireStaff('moderation');
    return ok(await buildModerationQueue());
  });
}

/**
 * Решение по компании или вакансии.
 *
 * Вакансию одобряют только у одобренной компании: у неодобренной она всё
 * равно не появилась бы в ленте, а решение выглядело бы принятым. И только
 * ту, что сейчас на проверке, — компания могла снять её или переписать,
 * пока HR смотрел старую версию страницы.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireStaff('moderation');
    const { entity, id, decision, note, version } = moderationDecisionSchema.parse(await request.json());
    const store = await getStore();
    const approve = decision === 'APPROVE';

    if (entity === 'company') {
      const employer = await store.employers.findById(id);
      if (!employer) return fail(404, 'Компания не найдена', 'NOT_FOUND');

      const updated = await store.employers.setModeration(id, {
        status: approve ? 'APPROVED' : 'REJECTED',
        note: approve ? null : (note ?? null),
      });
      await audit(
        session,
        { action: approve ? 'employer.approved' : 'employer.rejected', entity: 'Employer', entityId: id },
        request.headers,
      );
      if (approve) await track('company.approved', { employerId: id });
      await notifyCompanyDecision(updated, approve, approve ? null : (note ?? null));
      return ok({ id, status: updated.moderationStatus });
    }

    const vacancy = await store.vacancies.findById(id);
    if (!vacancy) return fail(404, 'Вакансия не найдена', 'NOT_FOUND');
    if (vacancy.status !== 'PENDING') {
      return fail(409, 'Вакансия уже не на проверке — обновите страницу', 'NOT_PENDING');
    }
    // Решение — о той версии, которую HR видел. Компания могла сохранить
    // правку, пока открыта очередь, и одобрить её вслепую нельзя
    if (version && version !== vacancy.updatedAt.toISOString()) {
      return fail(409, 'Компания изменила вакансию, пока вы её смотрели, — обновите страницу', 'STALE_VERSION');
    }

    if (approve) {
      const employer = await store.employers.findById(vacancy.employerId);
      if (employer?.moderationStatus !== 'APPROVED') {
        return fail(409, 'Сначала одобрите компанию — без неё вакансия студентам не видна', 'COMPANY_NOT_APPROVED');
      }
      const now = new Date();
      // Дата публикации — момент одобрения: в ленте вакансия свежая,
      // а не датированная днём, когда компания завела черновик
      await store.vacancies.update(id, {
        status: 'PUBLISHED',
        isActive: true,
        moderationNote: null,
        moderatedAt: now,
        publishedAt: now,
        // Снимок одобренного: пока следующая правка ждёт проверки, студенты,
        // которые уже откликнулись, видят именно его
        approvedContent: vacancyContentOf(vacancy),
      });
      await track('vacancy.published', { vacancyId: id, employerId: vacancy.employerId });
    } else {
      await store.vacancies.update(id, {
        status: 'REJECTED',
        isActive: false,
        moderationNote: note ?? null,
        moderatedAt: new Date(),
      });
    }

    await audit(
      session,
      { action: approve ? 'vacancy.approved' : 'vacancy.rejected', entity: 'Vacancy', entityId: id },
      request.headers,
    );
    await notifyVacancyDecision(vacancy, approve, approve ? null : (note ?? null));
    return ok({ id, status: approve ? 'PUBLISHED' : 'REJECTED' });
  });
}
