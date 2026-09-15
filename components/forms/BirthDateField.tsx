'use client';

import { useId, useState } from 'react';
import { SelectField } from '@/components/ui/Field';
import { MAX_AGE, MIN_AGE, MONTH_LABEL, daysInMonth, parseIsoDate, todayInMoscow } from '@/lib/age';

/**
 * Дата рождения тремя списками: день, месяц, год.
 *
 * Не <input type="date">: на телефоне он открывает календарь с текущего
 * месяца, и до года рождения приходится листать двадцать лет назад. Три
 * списка заполняются за три касания и одинаково выглядят во всех браузерах.
 *
 * Наружу уходит «ГГГГ-ММ-ДД» или пустая строка, пока дата не собрана
 * целиком: неполная дата — это отсутствие даты, а не дата с нулями.
 */
export function BirthDateField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const initial = parseIsoDate(value);
  const [day, setDay] = useState(initial ? String(initial.day) : '');
  const [month, setMonth] = useState(initial ? String(initial.month) : '');
  const [year, setYear] = useState(initial ? String(initial.year) : '');
  const errorId = useId();

  const thisYear = todayInMoscow().year;
  // Год ещё не выбран — считаем високосным, чтобы 29 февраля не пропадало
  const maxDay = daysInMonth(year ? Number(year) : 2000, month ? Number(month) : 1);

  function update(next: { day?: string; month?: string; year?: string }) {
    let d = next.day ?? day;
    const m = next.month ?? month;
    const y = next.year ?? year;
    // 31 марта → февраль: день становится последним днём месяца, а не пустым
    if (d && m) {
      const limit = daysInMonth(y ? Number(y) : 2000, Number(m));
      if (Number(d) > limit) d = String(limit);
    }
    setDay(d);
    setMonth(m);
    setYear(y);
    onChange(d && m && y ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : '');
  }

  const placeholder = { value: '', label: '—' };

  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="mb-3 text-[12.5px] uppercase tracking-[0.12em] text-paper-faint">Дата рождения</legend>
      <div className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)_minmax(0,6.75rem)] gap-2">
        <SelectField
          label="День"
          value={day}
          aria-invalid={!!error}
          onChange={(e) => update({ day: e.target.value })}
          options={[placeholder, ...Array.from({ length: maxDay }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))]}
        />
        <SelectField
          label="Месяц"
          value={month}
          aria-invalid={!!error}
          onChange={(e) => update({ month: e.target.value })}
          options={[placeholder, ...MONTH_LABEL.map((label, i) => ({ value: String(i + 1), label }))]}
        />
        <SelectField
          label="Год"
          value={year}
          aria-invalid={!!error}
          onChange={(e) => update({ year: e.target.value })}
          options={[
            placeholder,
            ...Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, i) => {
              const option = String(thisYear - MIN_AGE - i);
              return { value: option, label: option };
            }),
          ]}
        />
      </div>
      {error ? (
        <p id={errorId} className="pl-1 pt-1.5 text-[12.5px] leading-snug text-danger">
          {error}
        </p>
      ) : (
        <p className="pl-1 pt-1.5 text-[12.5px] leading-snug text-paper-faint">
          Регистрация — с {MIN_AGE} лет. Работодатель видит только возраст, не дату.
        </p>
      )}
    </fieldset>
  );
}
