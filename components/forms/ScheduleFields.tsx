'use client';

import { useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { HOURS_OPTIONS, fitHours, maxHoursPerWeek } from '@/lib/schedule';
import { WEEKDAYS, WEEKDAY_LABEL, type Weekday } from '@/lib/types';

/**
 * Дни и часы работы — в регистрации и в профиле одинаково.
 *
 * Часы подстраиваются под дни: варианты больше возможного гаснут, а если
 * студент снял день и выбранные часы перестали помещаться, они уменьшаются
 * сами — с пояснением, почему. Молча поменять цифру значит заставить
 * человека гадать, не ошибся ли он.
 */
export function ScheduleFields({
  workDays,
  hoursPerWeek,
  errors,
  onChange,
}: {
  workDays: Weekday[];
  hoursPerWeek: number | null;
  errors: Record<string, string | undefined>;
  onChange: (next: { workDays: Weekday[]; hoursPerWeek: number | null }) => void;
}) {
  const [reducedFrom, setReducedFrom] = useState<number | null>(null);
  const everyDay = workDays.length === WEEKDAYS.length;
  const max = maxHoursPerWeek(workDays.length);

  function setDays(next: Weekday[]) {
    const ordered = WEEKDAYS.filter((day) => next.includes(day));
    const fitted = fitHours(hoursPerWeek, ordered.length);
    setReducedFrom(fitted !== hoursPerWeek ? hoursPerWeek : null);
    onChange({ workDays: ordered, hoursPerWeek: fitted });
  }

  const daysPhrase = workDays.length === 1 ? 'одном дне' : `${workDays.length} днях`;

  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="mb-3 text-[12.5px] uppercase tracking-[0.12em] text-paper-faint">
          В какие дни готовы работать
        </legend>
        <Chip selected={everyDay} onToggle={() => setDays(everyDay ? [] : [...WEEKDAYS])} className="mb-3">
          Каждый день
        </Chip>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((day) => (
            <Chip
              key={day}
              selected={workDays.includes(day)}
              onToggle={() =>
                setDays(workDays.includes(day) ? workDays.filter((d) => d !== day) : [...workDays, day])
              }
              className="min-w-[3.25rem] justify-center"
            >
              {WEEKDAY_LABEL[day]}
            </Chip>
          ))}
        </div>
        {errors.workDays && <p className="pt-2.5 text-[12.5px] text-danger">{errors.workDays}</p>}
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-[12.5px] uppercase tracking-[0.12em] text-paper-faint">
          Сколько часов в неделю
        </legend>
        <div className="flex flex-wrap gap-2">
          {HOURS_OPTIONS.map((hours) => (
            <Chip
              key={hours}
              selected={hoursPerWeek === hours}
              disabled={workDays.length > 0 && hours > max}
              onToggle={() => {
                setReducedFrom(null);
                onChange({ workDays, hoursPerWeek: hours });
              }}
            >
              до {hours} ч
            </Chip>
          ))}
        </div>
        {errors.hoursPerWeek && <p className="pt-2.5 text-[12.5px] text-danger">{errors.hoursPerWeek}</p>}
        {reducedFrom !== null && hoursPerWeek !== null && (
          <p className="pt-3 text-[12.5px] leading-snug text-warn">
            Часы уменьшены с {reducedFrom} до {hoursPerWeek}: столько не помещается в выбранные дни.
          </p>
        )}
        <p className="pt-3 text-[12.5px] leading-snug text-paper-faint">
          {workDays.length === 0
            ? 'Сначала отметьте дни — часы подстроятся под них.'
            : `При ${daysPhrase} — не больше ${max} часов в неделю.`}{' '}
          Вакансии с большей нагрузкой опустятся ниже в ленте, но не исчезнут.
        </p>
      </fieldset>
    </div>
  );
}
