import 'server-only';
import { appUrl } from '@/lib/app-url';
import { getStore } from '@/lib/db';
import type {
  ApplicationRecord,
  EmployerRecord,
  MessageRecord,
  StudentRecord,
  VacancyRecord,
} from '@/lib/db/types';
import {
  applicationStatusMail,
  closedVacancyReminderMail,
  companyDecisionMail,
  messagesDigestMail,
  newApplicationMail,
  pendingExpiryMail,
  studyApprovedMail,
  studyDeadlineMail,
  studyRejectedMail,
  vacancyDecisionMail,
  type MailContent,
} from '@/lib/mail/templates';
import { sendMail } from '@/lib/mail/transport';
import { decryptSafe } from '@/lib/security/crypto';
import { buildStudyState, listWaitingSwipes } from '@/lib/services';
import { pendingExpiresAt } from '@/lib/study';
import type { ApplicationStatus, MessageAuthor } from '@/lib/types';
import { CLOSED_VACANCY_AUTO_DELETE_DAYS, CLOSED_VACANCY_REMINDER_DAYS } from '@/lib/vacancy';

/**
 * Уведомления на почту.
 *
 * Два рода писем. О решениях — учёба подтверждена, компания проверена,
 * работодатель пригласил — приходят всегда: это ответ на действие самого
 * человека. Напоминания и сводки о сообщениях человек может отключить в
 * профиле.
 *
 * Ни одна функция не бросает: письмо не должно отменять решение HR или
 * смену статуса отклика. SMS добавится отдельным каналом рядом с deliver.
 */

type MailKind = 'decision' | 'reminder';

async function deliver(accountId: string, content: MailContent, kind: MailKind): Promise<boolean> {
  try {
    const store = await getStore();
    const account = await store.accounts.findById(accountId);
    if (!account || !account.isActive) return false;
    if (kind === 'reminder' && !account.notifyEmail) return false;
    const to = decryptSafe(account.emailEnc);
    if (!to) return false;
    return await sendMail({ to, ...content });
  } catch (error) {
    console.error('[уведомление] не отправлено:', error);
    return false;
  }
}

/** Название, которое видит студент: пока правка на проверке — одобренное. */
function shownTitle(vacancy: VacancyRecord): string {
  return (vacancy.approvedContent ?? vacancy).title;
}

export async function notifyStudyDecision(
  student: StudentRecord,
  decision: { approved: true; released: number } | { approved: false; note: string },
): Promise<void> {
  const content = decision.approved
    ? studyApprovedMail({ released: decision.released, url: appUrl('/feed') })
    : studyRejectedMail({ note: decision.note, url: appUrl('/profile#study') });
  await deliver(student.accountId, content, 'decision');
}

export async function notifyCompanyDecision(employer: EmployerRecord, approved: boolean, note: string | null): Promise<void> {
  await deliver(
    employer.accountId,
    companyDecisionMail({ company: employer.companyName, approved, note, url: appUrl('/employer/company') }),
    'decision',
  );
}

export async function notifyVacancyDecision(vacancy: VacancyRecord, approved: boolean, note: string | null): Promise<void> {
  try {
    const store = await getStore();
    const employer = await store.employers.findById(vacancy.employerId);
    if (!employer) return;
    await deliver(
      employer.accountId,
      vacancyDecisionMail({ title: vacancy.title, approved, note, url: appUrl('/employer/vacancies') }),
      'decision',
    );
  } catch (error) {
    console.error('[уведомление] решение по вакансии не отправлено:', error);
  }
}

/** Работодатель сменил статус отклика — студенту. На NEW писем нет. */
export async function notifyApplicationStatus(application: ApplicationRecord, status: ApplicationStatus): Promise<void> {
  try {
    const store = await getStore();
    const [student, vacancy] = await Promise.all([
      store.students.findById(application.studentId),
      store.vacancies.findById(application.vacancyId),
    ]);
    if (!student || !vacancy) return;
    const employer = await store.employers.findById(vacancy.employerId);
    const content = applicationStatusMail({
      status,
      company: employer?.companyName ?? 'Работодатель',
      title: shownTitle(vacancy),
      url: appUrl('/applications'),
    });
    if (content) await deliver(student.accountId, content, 'decision');
  } catch (error) {
    console.error('[уведомление] статус отклика не отправлен:', error);
  }
}

/**
 * Новые отклики — компаниям. Одно письмо на отклик: повторный свайп той же
 * вакансии после отмены второго письма не шлёт.
 */
export async function notifyNewApplications(applicationIds: string[]): Promise<void> {
  for (const id of applicationIds) {
    try {
      const store = await getStore();
      const application = await store.applications.findById(id);
      const vacancy = application ? await store.vacancies.findById(application.vacancyId) : null;
      const employer = vacancy ? await store.employers.findById(vacancy.employerId) : null;
      if (!vacancy || !employer) continue;
      if (!(await store.notifications.claim(employer.accountId, `new-application:${id}`))) continue;
      await deliver(employer.accountId, newApplicationMail({ title: vacancy.title, url: appUrl('/employer') }), 'decision');
    } catch (error) {
      console.error('[уведомление] новый отклик не отправлен:', error);
    }
  }
}

/** Сводка приходит, если сообщение не прочитали за это время. */
export const DIGEST_AFTER_MINUTES = 10;
/** Старые непрочитанные не поднимаем: письмо о переписке недельной давности только путает. */
const DIGEST_MAX_AGE_DAYS = 3;
/** За сколько дней до удаления ожидающего отклика предупреждать. */
const EXPIRY_WARN_DAYS = 2;
const DAY_MS = 86_400_000;

export interface NotificationRunResult {
  studyDeadline: number;
  pendingExpiry: number;
  messageDigests: number;
  closedVacancyReminders: number;
  closedVacancyDeletions: number;
}

/**
 * Один проход напоминаний: срок справки, отклики, которые скоро удалятся,
 * и сводки о непрочитанных сообщениях. Повторный проход не шлёт уже
 * отправленное — отметки лежат в NotificationLog. Запускается по расписанию
 * (npm run notify:run) или HR-менеджером из панели.
 */
export async function runNotificationJobs(now: Date = new Date()): Promise<NotificationRunResult> {
  const store = await getStore();
  const result: NotificationRunResult = {
    studyDeadline: 0,
    pendingExpiry: 0,
    messageDigests: 0,
    closedVacancyReminders: 0,
    closedVacancyDeletions: 0,
  };

  for (const student of await store.students.list()) {
    try {
      if (!student.studyVerified) {
        const state = buildStudyState(student);
        const needsDocument = state.status === 'NONE' || state.status === 'REJECTED';
        if (needsDocument && !state.deadlinePassed && state.workdaysLeft <= 1) {
          if (await store.notifications.claim(student.accountId, 'study-deadline')) {
            const daysText = state.workdaysLeft === 1 ? 'Остался один рабочий день' : 'Сегодня последний день';
            const sent = await deliver(student.accountId, studyDeadlineMail({ daysText, url: appUrl('/profile#study') }), 'reminder');
            if (sent) result.studyDeadline++;
          }
        }
      }

      let expiring = 0;
      for (const swipe of await listWaitingSwipes(student.id)) {
        if (pendingExpiresAt(swipe.createdAt).getTime() - now.getTime() > EXPIRY_WARN_DAYS * DAY_MS) continue;
        if (await store.notifications.claim(student.accountId, `pending-expiry:${swipe.id}`)) expiring++;
      }
      if (expiring > 0) {
        const sent = await deliver(student.accountId, pendingExpiryMail({ count: expiring, url: appUrl('/applications') }), 'reminder');
        if (sent) result.pendingExpiry++;
      }
    } catch (error) {
      console.error('[напоминания] студент пропущен:', error);
    }
  }

  // Непрочитанное — по переписке и стороне: одно письмо на новое сообщение,
  // сколько бы их ни пришло подряд
  const groups = new Map<string, { applicationId: string; author: MessageAuthor; count: number; last: MessageRecord }>();
  for (const message of await store.messages.listUnreadBefore(new Date(now.getTime() - DIGEST_AFTER_MINUTES * 60_000))) {
    const key = `${message.applicationId}:${message.author}`;
    const group = groups.get(key);
    if (group) {
      group.count++;
      group.last = message;
    } else {
      groups.set(key, { applicationId: message.applicationId, author: message.author, count: 1, last: message });
    }
  }

  for (const group of groups.values()) {
    if (now.getTime() - group.last.createdAt.getTime() > DIGEST_MAX_AGE_DAYS * DAY_MS) continue;
    try {
      const application = await store.applications.findById(group.applicationId);
      const vacancy = application ? await store.vacancies.findById(application.vacancyId) : null;
      if (!application || !vacancy) continue;

      // Написал студент — ждёт компания, и наоборот
      const recipient =
        group.author === 'STUDENT'
          ? { accountId: (await store.employers.findById(vacancy.employerId))?.accountId, url: appUrl('/employer/messages') }
          : { accountId: (await store.students.findById(application.studentId))?.accountId, url: appUrl('/messages') };
      if (!recipient.accountId) continue;
      if (!(await store.notifications.claim(recipient.accountId, `digest:${group.last.id}`))) continue;

      const sent = await deliver(
        recipient.accountId,
        messagesDigestMail({ count: group.count, title: shownTitle(vacancy), url: recipient.url }),
        'reminder',
      );
      if (sent) result.messageDigests++;
    } catch (error) {
      console.error('[сводка] переписка пропущена:', error);
    }
  }

  // Уборка снятых вакансий: без сохранения — удаляем через 3 дня, с
  // сохранением — раз в неделю напоминаем, что она всё ещё лежит в базе.
  for (const vacancy of await store.vacancies.listByStatus('CLOSED')) {
    try {
      if (!vacancy.closedAt || vacancy.crmId) continue; // старые записи и CRM-вакансии уборка не трогает

      if (vacancy.keepAfterClose === false) {
        if (now.getTime() - vacancy.closedAt.getTime() < CLOSED_VACANCY_AUTO_DELETE_DAYS * DAY_MS) continue;
        await store.vacancies.delete(vacancy.id);
        result.closedVacancyDeletions++;
        continue;
      }

      if (vacancy.keepAfterClose === true) {
        const since = vacancy.lastCleanupReminderAt ?? vacancy.closedAt;
        if (now.getTime() - since.getTime() < CLOSED_VACANCY_REMINDER_DAYS * DAY_MS) continue;
        const employer = await store.employers.findById(vacancy.employerId);
        if (!employer) continue;
        if (!(await store.notifications.claim(employer.accountId, `closed-vacancy-reminder:${vacancy.id}:${now.toDateString()}`))) continue;
        const sent = await deliver(
          employer.accountId,
          closedVacancyReminderMail({ title: vacancy.title, url: appUrl('/employer/vacancies') }),
          'reminder',
        );
        if (sent) result.closedVacancyReminders++;
        await store.vacancies.update(vacancy.id, { lastCleanupReminderAt: now });
      }
    } catch (error) {
      console.error('[уборка] снятая вакансия пропущена:', error);
    }
  }

  return result;
}
