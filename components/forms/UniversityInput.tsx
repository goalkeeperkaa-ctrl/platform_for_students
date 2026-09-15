'use client';

import { useId, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { TextField } from '@/components/ui/Field';
import { exactInstitution, institutionLabel, searchInstitutions } from '@/lib/institutions';
import { cn } from '@/lib/utils';
import type { InstitutionOption } from '@/lib/types';

/**
 * Вуз: подсказки из справочника, но и свободный ввод.
 *
 * Справочник не обязан знать каждый колледж, и регистрация не должна
 * останавливаться на том, что вуза нет в списке. Выбранный из списка вуз
 * запоминается идентификатором — по нему HR видит, сколько студентов от
 * какого учреждения, и может подтвердить учёбу. Любая правка текста после
 * выбора отвязывает поле от справочника, иначе «МГУ» с вписанным поверх
 * «колледж» числился бы МГУ.
 */
export function UniversityInput({
  label = 'Вуз',
  value,
  institutionId,
  institutions,
  error,
  autoFocus,
  onChange,
}: {
  label?: string;
  value: string;
  institutionId: string | null;
  institutions: InstitutionOption[];
  error?: string;
  autoFocus?: boolean;
  onChange: (next: { university: string; institutionId: string | null }) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selected = institutionId ? (institutions.find((i) => i.id === institutionId) ?? null) : null;
  const matches = useMemo(
    () => (selected ? [] : searchInstitutions(institutions, value).slice(0, 7)),
    [institutions, value, selected],
  );
  const showList = open && matches.length > 0;

  function pick(option: InstitutionOption) {
    onChange({ university: institutionLabel(option), institutionId: option.id });
    setOpen(false);
  }

  return (
    <div className="relative">
      <TextField
        label={label}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        value={value}
        error={error}
        hint={
          selected
            ? `${selected.name} · ${selected.city}`
            : institutions.length > 0
              ? 'Начните вводить — подскажем из списка. Нет вашего вуза — впишите как есть.'
              : 'Например, КФУ'
        }
        onChange={(e) => {
          const text = e.target.value;
          onChange({ university: text, institutionId: exactInstitution(institutions, text)?.id ?? null });
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => (i + 1) % matches.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => (i - 1 + matches.length) % matches.length);
          } else if (e.key === 'Enter') {
            // Enter выбирает подсказку, а не отправляет форму или шаг мастера
            e.preventDefault();
            pick(matches[Math.min(active, matches.length - 1)]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Вузы из справочника"
          // Фон непрозрачный: сквозь полупрозрачный просвечивала подсказка
          // под полем и читалась поверх вариантов
          className="absolute inset-x-0 top-[66px] z-30 max-h-72 overflow-y-auto rounded-xl border border-[var(--hairline-strong)] bg-graphite-900 p-1 shadow-2xl"
        >
          {matches.map((option, i) => (
            <li
              key={option.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown без потери фокуса: иначе поле закрыло бы список
              // раньше, чем дошёл клик по варианту
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(option)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-start justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors',
                i === active && 'bg-paper/[0.07]',
              )}
            >
              <span className="min-w-0">
                <span className="block text-[14px] text-paper">{institutionLabel(option)}</span>
                {option.shortName && (
                  <span className="block truncate text-[12px] text-paper-faint">{option.name}</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1 pt-0.5 text-[12px] text-paper-faint">
                <MapPin className="size-3" aria-hidden />
                {option.city}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
