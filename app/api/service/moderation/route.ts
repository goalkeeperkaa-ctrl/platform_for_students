import { z } from 'zod';
import { fail, handle, ok } from '@/lib/api';
import { getStore } from '@/lib/db';
import { auditService } from '@/lib/security/guards';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { buildModerationQueue } from '@/lib/services';
import { track } from '@/lib/analytics';
import { notifyCompanyDecision, notifyVacancyDecision } from '@/lib/notify';
import { moderationDecisionSchema, vacancyContentOf } from '@/lib/vacancy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Модерация компаний и вакансий — служебный API для «Проверок» в CRM.
 * Логика решения та же, что в /api/admin/moderation (её нельзя было
 * просто вызвать оттуда: аудит там привязан к сессии этой платформы,
 * а решение здесь принимает сотрудник CRM без такой сессии).
 */
export async function GET(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    return ok(await buildModerationQueue());
  });
}

/** Кто в CRM принял решение — для журнала аудита (см. auditService). */
const actorSchema = z.object({ actor: z.string().trim().min(1).max(200) });

export async function POST(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const body = await request.json();
    const { entity, id, decision, note, version } = moderationDecisionSchema.parse(body);
    const { actor } = actorSchema.parse(body);
    const store = await getStore();
    const approve = decision === 'APPROVE';

    if (entity === 'company') {
      const employer = await store.employers.findById(id);
      if (!employer) return fail(404, 'Компания не найдена', 'NOT_FOUND');

      const updated = await store.employers.setModeration(id, {
        status: approve ? 'APPROVED' : 'REJECTED',
        note: approve ? null : (note ?? null),
      });
      await auditService(
        actor,
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
    if (version && version !== vacancy.updatedAt.toISOString()) {
      return fail(409, 'Компания изменила вакансию, пока вы её смотрели, — обновите страницу', 'STALE_VERSION');
    }

    if (approve) {
      const employer = await store.employers.findById(vacancy.employerId);
      if (employer?.moderationStatus !== 'APPROVED') {
        return fail(409, 'Сначала одобрите компанию — без неё вакансия студентам не видна', 'COMPANY_NOT_APPROVED');
      }
      const now = new Date();
      await store.vacancies.update(id, {
        status: 'PUBLISHED',
        isActive: true,
        moderationNote: null,
        moderatedAt: now,
        publishedAt: now,
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

    await auditService(
      actor,
      { action: approve ? 'vacancy.approved' : 'vacancy.rejected', entity: 'Vacancy', entityId: id },
      request.headers,
    );
    await notifyVacancyDecision(vacancy, approve, approve ? null : (note ?? null));
    return ok({ id, status: approve ? 'PUBLISHED' : 'REJECTED' });
  });
}
