/**
 * Подтверждение учёбы: статус, сроки, формат файла.
 *
 * Правило пилота. Студент смотрит ленту и свайпает сразу после регистрации,
 * но отклик уходит работодателю только после того, как HR-менеджер
 * подтвердил учёбу. Справку просим загрузить за четыре рабочих дня — столько
 * её обычно делают в деканате. Отклик, который ждёт подтверждения дольше
 * двух недель, удаляется: работодатель к тому времени уже нашёл другого, а
 * вакансия возвращается в ленту.
 *
 * Модуль без зависимостей: одни и те же сроки у страницы, ленты и сервера.
 */

export const STUDY_DOC_WORKDAYS = 4;
export const PENDING_APPLICATION_DAYS = 14;

const DAY = 86_400_000;

/**
 * Вуз/специальность/курс убраны из регистрации — их дозаполняют в профиле.
 * Колонки в базе обязательные (NOT NULL), поэтому до дозаполнения туда
 * пишется плейсхолдер, а не NULL. Настоящее значение вуза и специальности
 * проходит `min(2)` при вводе, а курс лежит в 1–6 — плейсхолдеры лежат вне
 * этих диапазонов и поэтому не спутать с реальными данными.
 */
export const EDUCATION_PLACEHOLDER = '';
export const EDUCATION_PLACEHOLDER_YEAR = 0;

/** Дозаполнены ли вуз, специальность и курс — или там ещё плейсхолдер. */
export function hasEducation(student: { university: string; speciality: string; studyYear: number }): boolean {
  return (
    student.university.trim().length > 0 &&
    student.speciality.trim().length > 0 &&
    student.studyYear > 0
  );
}

/** Файл справки — только загруженный через платформу, вида `study`. */
export const STUDY_FILE_PATTERN = /^\/api\/files\/study\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i;

export type StudyStatus = 'VERIFIED' | 'PENDING' | 'REJECTED' | 'NONE';

export function studyStatus(student: {
  studyVerified: boolean;
  studyDocUrl: string | null;
  studyReviewNote: string | null;
}): StudyStatus {
  if (student.studyVerified) return 'VERIFIED';
  if (student.studyDocUrl) return 'PENDING';
  if (student.studyReviewNote) return 'REJECTED';
  return 'NONE';
}

/**
 * Дата через n рабочих дней, с понедельника по пятницу. Праздники не
 * учитываются: срок мягкий, он для напоминания, а не для блокировки.
 */
export function addWorkdays(from: Date, days: number): Date {
  const date = new Date(from);
  let left = days;
  while (left > 0) {
    date.setDate(date.getDate() + 1);
    const weekday = date.getDay();
    if (weekday !== 0 && weekday !== 6) left--;
  }
  return date;
}

/**
 * Сколько рабочих дней осталось до срока — по календарным дням, а не по
 * часам: в пятницу в 11:00 при сроке в четверг в 10:00 осталось четыре дня
 * (пн–чт), а не три. 0 — срок сегодня или уже прошёл.
 */
export function workdaysLeft(deadline: Date, now: Date = new Date()): number {
  const end = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let count = 0;
  for (let i = 0; i < 62 && +date < +end; i++) {
    date.setDate(date.getDate() + 1);
    const weekday = date.getDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

export function studyDocDeadline(registeredAt: Date): Date {
  return addWorkdays(registeredAt, STUDY_DOC_WORKDAYS);
}

export function pendingExpiresAt(swipedAt: Date): Date {
  return new Date(+swipedAt + PENDING_APPLICATION_DAYS * DAY);
}

export function isPendingExpired(swipedAt: Date, now: Date = new Date()): boolean {
  return +now >= +pendingExpiresAt(swipedAt);
}

/** Полных дней до даты, не меньше нуля. */
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((+date - +now) / DAY));
}

/**
 * Отклики уходят работодателю, только когда подтверждены и учёба, и почта,
 * и дозаполнены вуз/специальность/курс (после упрощённой регистрации их
 * могло не быть). До тех пор свайп вправо сохраняется и ждёт
 * (releasePendingApplications) — без автоудаления по этой причине, только
 * пока не истёк общий двухнедельный срок ожидания.
 */
export function applicationsOpen(
  student: { studyVerified: boolean; university: string; speciality: string; studyYear: number },
  account: { emailVerifiedAt: Date | null } | null,
): boolean {
  return student.studyVerified && Boolean(account?.emailVerifiedAt) && hasEducation(student);
}
