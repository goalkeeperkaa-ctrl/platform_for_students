/**
 * Сколько часов в неделю может работать студент при выбранных днях.
 *
 * Один день и сорок часов в неделю — ошибка, которую форма принимала молча,
 * а работодатель видел в анкете. Потолок — восемь часов в день и сорок в
 * неделю, как норма рабочего времени: больше в анкете студента не бывает.
 *
 * Модуль без зависимостей: правило одно для формы и для сервера.
 */

export const MAX_HOURS_PER_DAY = 8;
export const MAX_HOURS_PER_WEEK = 40;
export const MIN_HOURS_PER_WEEK = 4;

export const HOURS_OPTIONS = [4, 8, 12, 16, 20, 24, 30, 40] as const;

export function maxHoursPerWeek(days: number): number {
  return Math.min(Math.max(0, days) * MAX_HOURS_PER_DAY, MAX_HOURS_PER_WEEK);
}

/**
 * Часы, подогнанные под дни: если выбранное больше возможного, берётся
 * наибольший вариант, который помещается. Без дней подгонять не к чему.
 */
export function fitHours(hours: number | null, days: number): number | null {
  if (hours === null || days < 1) return hours;
  const max = maxHoursPerWeek(days);
  if (hours <= max) return hours;
  return [...HOURS_OPTIONS].reverse().find((option) => option <= max) ?? max;
}
