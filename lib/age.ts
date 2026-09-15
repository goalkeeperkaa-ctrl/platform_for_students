/**
 * Возраст по полной дате рождения.
 *
 * По одному году рождения нельзя сказать, исполнилось ли человеку 18: в
 * январе родившийся в декабре ещё несовершеннолетний. Поэтому дата полная,
 * а считается она по календарю Москвы — не по поясу сервера или браузера:
 * иначе на границе суток форма пропускала бы то, что отвергает сервер.
 *
 * Модуль без зависимостей: его используют и форма, и сервер.
 */

export const MIN_AGE = 18;
export const MAX_AGE = 60;

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** «2005-04-12» → дата; несуществующая дата («2005-02-30») — null. */
export function parseIsoDate(value: string): CalendarDate | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function toIsoDate({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function todayInMoscow(now: Date = new Date()): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * Полных лет на дату.
 *
 * Родившийся 29 февраля в невисокосный год становится старше 1 марта, а не
 * 28 февраля: для порога 18+ ошибиться на день позже безопаснее, чем раньше.
 */
export function fullYears(birth: CalendarDate, on: CalendarDate): number {
  let years = on.year - birth.year;
  if (on.month < birth.month || (on.month === birth.month && on.day < birth.day)) years--;
  return years;
}

/** Возраст сегодня по дате в формате «ГГГГ-ММ-ДД»; битая дата — null. */
export function ageFromIso(value: string, now: Date = new Date()): number | null {
  const birth = parseIsoDate(value);
  return birth ? fullYears(birth, todayInMoscow(now)) : null;
}

export const MONTH_LABEL = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;
