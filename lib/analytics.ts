import 'server-only';
import { getStore } from '@/lib/db';
import type { ApplicationStatus, EventType } from '@/lib/types';

/**
 * Журнал событий пилота.
 *
 * Отдельно от журнала аудита. Аудит отвечает на вопрос «кто трогал данные»
 * и хранит IP и подпись актора; здесь вопрос другой — «дошёл ли человек до
 * следующего шага», и кроме идентификаторов ничего не нужно. Смешай их —
 * метрики пришлось бы считать по журналу безопасности, который нельзя ни
 * чистить, ни показывать шире.
 *
 * Идентификаторы без внешних ключей: удалённый студент исчезает из базы,
 * а событие остаётся обезличенным счётчиком.
 *
 * Как и аудит, никогда не бросает: сбой метрики не должен отменять отклик.
 */
export async function track(
  type: EventType,
  refs: {
    studentId?: string | null;
    employerId?: string | null;
    vacancyId?: string | null;
    applicationId?: string | null;
  } = {},
): Promise<void> {
  try {
    const store = await getStore();
    await store.events.log({
      type,
      studentId: refs.studentId ?? null,
      employerId: refs.employerId ?? null,
      vacancyId: refs.vacancyId ?? null,
      applicationId: refs.applicationId ?? null,
    });
  } catch (err) {
    console.error('[analytics] не удалось записать событие:', err);
  }
}

/**
 * «Следующий шаг» по отклику — приглашение, собеседование, выход на работу.
 * Для метрик пилота это возможность, которую студент получил через платформу.
 */
export const NEXT_STEP_STATUSES: readonly ApplicationStatus[] = ['INVITED', 'INTERVIEW', 'HIRED'];
