import { handle, ok, tooManyRequests } from '@/lib/api';
import { getStore } from '@/lib/db';
import { CRM_VACANCIES } from '@/lib/db/seed-data';
import { assertSameOrigin, audit, requireStaff } from '@/lib/security/guards';
import { rateLimit } from '@/lib/security/rate-limit';
import { toSyncRunDTO } from '@/lib/services';

export const runtime = 'nodejs';

/**
 * Синхронизация вакансий из CRM агентства.
 *
 * Источник — HTTP-выгрузка CRM по адресу CRM_SYNC_URL. Без адреса в
 * разработке берётся демонстрационная выгрузка; на бою синхронизация
 * отказывает. Контракт (`CrmVacancyInput[]`) и вся обработка —
 * сопоставление по crmId, снятие с публикации пропавших, журнал запусков.
 *
 * Каждый запуск пишется в SyncRun целиком, включая падения: «синхронизация
 * не прошла, а никто не заметил» — худший из сценариев.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireStaff('moderation');

    const limit = await rateLimit('sync', session.accountId);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const store = await getStore();
    const run = await store.syncRuns.start('crm');

    try {
      const outcome = await store.vacancies.syncFromCrm(await fetchCrmVacancies());
      const finished = await store.syncRuns.finish(run.id, { status: 'SUCCESS', ...outcome });
      await audit(
        session,
        { action: 'sync.run', entity: 'SyncRun', entityId: run.id, meta: { ...outcome } },
        request.headers,
      );
      return ok({ run: finished ? toSyncRunDTO(finished) : null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      const finished = await store.syncRuns.finish(run.id, { status: 'FAILED', error: message });
      await audit(session, { action: 'sync.failed', entity: 'SyncRun', entityId: run.id }, request.headers);
      return ok({ run: finished ? toSyncRunDTO(finished) : null }, { status: 502 });
    }
  });
}

/**
 * Выгрузка вакансий из CRM.
 *
 * Здесь всё про одно: не дать синхронизации испортить боевую базу.
 * Обработка ниже снимает с публикации каждую вакансию, которой нет в
 * выгрузке. Поэтому неверная выгрузка — не просто ошибка, а тихое
 * исчезновение настоящих вакансий из ленты.
 *
 * Три случая, каждый отказывает, а не «синхронизирует что есть»:
 *
 *  · нет адреса CRM на бою — раньше подставлялась демо-выгрузка, и
 *    одно нажатие скрывало настоящие вакансии, публикуя 14 выдуманных;
 *  · ответ без списка vacancies — сбой CRM, а не «вакансий нет»;
 *  · пустой список — у работающего агентства это почти всегда сбой или
 *    не тот токен при ответе 200, а цена ошибки — пустая лента у всех.
 *
 * Отказ пишется в журнал запусков со статусом FAILED и текстом
 * причины, который увидит HR-менеджер.
 */
async function fetchCrmVacancies() {
  const endpoint = process.env.CRM_SYNC_URL;
  if (!endpoint) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRM не подключена: не задан CRM_SYNC_URL. Демонстрационные вакансии в боевую базу не загружаются.',
      );
    }
    return CRM_VACANCIES;
  }

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${process.env.CRM_SYNC_TOKEN ?? ''}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`CRM ответила ${response.status}`);

  const payload = (await response.json()) as { vacancies?: unknown };
  if (!Array.isArray(payload.vacancies)) {
    throw new Error('CRM вернула ответ без списка vacancies — синхронизация отменена');
  }
  if (payload.vacancies.length === 0) {
    throw new Error(
      'CRM вернула пустой список вакансий. Синхронизация отменена: иначе с публикации снялись бы все вакансии.',
    );
  }
  return (payload.vacancies as typeof CRM_VACANCIES).map((v) => ({
    ...v,
    publishedAt: new Date(v.publishedAt),
    // Старая выгрузка CRM адреса не знает — это не ошибка, а пустой адрес
    address: v.address ?? null,
    addressDetails: v.addressDetails ?? null,
  }));
}
