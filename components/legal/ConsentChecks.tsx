'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, FileText, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { LegalDocumentView } from '@/components/legal/LegalDocumentView';
import { COMPANY_CONSENT, PRIVACY, STUDENT_CONSENT, TERMS, type LegalDocument } from '@/lib/legal';
import { springSoft } from '@/lib/motion';
import { cn } from '@/lib/utils';

export interface ConsentValues {
  consent: boolean;
  terms: boolean;
  marketing: boolean;
}

/**
 * Согласия при регистрации — три отдельные отметки, у каждой свой документ.
 *
 * Согласие на ПДн оформлено отдельно от соглашения (152-ФЗ): поэтому и
 * отметки разные, и текст открывается отдельной карточкой. Прочитать можно
 * до отметки; кнопка «Прочитал(а) и согласен(на)» в карточке ставит её сама.
 * Отметить, не открывая, тоже можно — принуждать к чтению закон не требует,
 * а документ должен быть доступен до согласия, и он доступен.
 *
 * Ссылка на документ стоит вне кнопки-отметки: вложенная кнопка внутри
 * кнопки — невалидная разметка, и клик по ссылке заодно ставил бы галочку.
 */
export function ConsentChecks({
  kind,
  value,
  errors,
  onChange,
}: {
  kind: 'student' | 'company';
  value: ConsentValues;
  errors: Record<string, string | undefined>;
  onChange: (next: Partial<ConsentValues>) => void;
}) {
  const [reading, setReading] = useState<LegalDocument | null>(null);
  const consentDoc = kind === 'student' ? STUDENT_CONSENT : COMPANY_CONSENT;

  const acceptField: keyof ConsentValues | null =
    reading?.slug === 'consent' || reading?.slug === 'company-consent'
      ? 'consent'
      : reading?.slug === 'terms'
        ? 'terms'
        : null;

  return (
    <div className="space-y-3">
      <p className="rounded-2xl border border-accent-500/25 bg-accent-500/[0.07] px-4 py-3 text-[13px] leading-relaxed text-paper-dim">
        Прочитайте внимательно: отмечая пункты ниже, вы соглашаетесь с документами. Каждый открывается
        по ссылке «Прочитать».
      </p>

      <CheckRow
        checked={value.consent}
        error={errors.consent}
        onToggle={() => onChange({ consent: !value.consent })}
        label={
          kind === 'student'
            ? 'Даю согласие на обработку моих персональных данных'
            : 'Даю согласие на обработку моих персональных данных как представителя компании'
        }
        required
        action={<ReadLink onClick={() => setReading(consentDoc)}>Прочитать согласие</ReadLink>}
      />

      <CheckRow
        checked={value.terms}
        error={errors.terms}
        onToggle={() => onChange({ terms: !value.terms })}
        label="Принимаю пользовательское соглашение"
        required
        action={<ReadLink onClick={() => setReading(TERMS)}>Прочитать соглашение</ReadLink>}
      />

      <CheckRow
        checked={value.marketing}
        onToggle={() => onChange({ marketing: !value.marketing })}
        label={
          kind === 'student'
            ? 'Хочу получать на почту подборки вакансий и новости платформы'
            : 'Хочу получать на почту новости платформы для компаний'
        }
        hint="Необязательно. Отказаться можно в любой момент."
      />

      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pl-1 text-[12px] text-paper-faint">
        <ShieldCheck className="size-3.5 shrink-0 text-accent-400" aria-hidden />
        Как мы храним и защищаем данные —
        <button
          type="button"
          onClick={() => setReading(PRIVACY)}
          className="text-paper/80 underline underline-offset-4 transition-colors hover:text-paper"
        >
          политика обработки персональных данных
        </button>
      </p>

      <Dialog
        open={reading !== null}
        title={reading?.title ?? ''}
        onClose={() => setReading(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReading(null)}>
              Закрыть
            </Button>
            {acceptField && (
              <Button
                variant="accent"
                icon={<Check />}
                onClick={() => {
                  onChange({ [acceptField]: true });
                  setReading(null);
                }}
              >
                Прочитал(а) и согласен(на)
              </Button>
            )}
          </>
        }
      >
        {reading && <LegalDocumentView doc={reading} headingLevel="h3" />}
      </Dialog>
    </div>
  );
}

function CheckRow({
  checked,
  error,
  onToggle,
  label,
  hint,
  required,
  action,
}: {
  checked: boolean;
  error?: string;
  onToggle: () => void;
  label: string;
  hint?: string;
  required?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div
        className={cn(
          'rounded-2xl border p-4 transition-colors duration-300',
          checked
            ? 'border-accent-400/50 bg-accent-500/[0.09]'
            : error
              ? 'border-danger/50 bg-danger/[0.05]'
              : 'border-[var(--hairline)] bg-graphite-900/45',
        )}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-invalid={!!error}
          onClick={onToggle}
          className="flex w-full items-start gap-3 text-left"
        >
          <span
            className={cn(
              'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
              checked ? 'border-accent-300 bg-accent-400' : 'border-paper/30 bg-paper/[0.05]',
            )}
          >
            <motion.span initial={false} animate={{ scale: checked ? 1 : 0, opacity: checked ? 1 : 0 }} transition={springSoft}>
              <Check className="size-3.5 text-ink" strokeWidth={3} aria-hidden />
            </motion.span>
          </span>
          <span className="text-[13.5px] leading-relaxed text-paper">
            {label}
            {required && <span className="text-paper-faint"> (обязательно)</span>}
            {hint && <span className="mt-0.5 block text-[12.5px] text-paper-faint">{hint}</span>}
          </span>
        </button>
        {action && <div className="mt-2 pl-8">{action}</div>}
      </div>
      {error && <p className="pl-1 pt-1.5 text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}

function ReadLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[13px] text-accent-200 underline-offset-4 transition-colors hover:text-paper hover:underline"
    >
      <FileText className="size-3.5" aria-hidden />
      {children}
    </button>
  );
}
