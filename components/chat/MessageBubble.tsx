'use client';

import { motion } from 'framer-motion';
import { Check, CheckCheck } from 'lucide-react';
import { springSoft } from '@/lib/motion';
import { cn, formatTime } from '@/lib/utils';
import type { MessageDTO } from '@/lib/types';

/**
 * Реплика в переписке.
 *
 * Своё — справа с акцентной заливкой, чужое — слева на графите. Срезанный
 * угол у нижней кромки заменяет «хвостик»: он указывает на сторону, но не
 * добавляет в тёмную тему лишнюю фигуру.
 *
 * Подряд идущие реплики одного человека складываются в залп: время
 * показывается только у последней, иначе колонка времени превращается в
 * рябь и мешает читать сам текст.
 */
export function MessageBubble({
  message,
  grouped,
  lastInBurst,
  pending,
}: {
  message: MessageDTO;
  /** Продолжение залпа: отступ сверху меньше */
  grouped: boolean;
  /** Последняя реплика залпа: только у неё видно время */
  lastInBurst: boolean;
  /** Ещё летит на сервер */
  pending?: boolean;
}) {
  const mine = message.mine;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: pending ? 0.55 : 1, y: 0, scale: 1 }}
      transition={springSoft}
      className={cn('flex w-full', mine ? 'justify-end' : 'justify-start', grouped ? 'mt-1' : 'mt-3')}
    >
      <div
        className={cn(
          // Тень и более плотная заливка — иначе в светлой теме своя и чужая
          // реплики почти сливались с фоном и друг с другом: разница была
          // в 20% прозрачности акцента поверх почти такого же серого, то
          // есть на глаз никакой. Переписка обязана читаться с одного
          // взгляда, кто где, — это чат, а не список полей формы.
          'max-w-[76%] rounded-2xl border px-3.5 py-2.5 shadow-sm sm:max-w-[68%]',
          mine
            ? 'rounded-br-md border-accent-400/40 bg-accent-500/85'
            : 'rounded-bl-md border-[var(--hairline-strong)] bg-graphite-800',
        )}
      >
        <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-paper">
          {message.body}
        </p>

        {lastInBurst && (
          <div
            className={cn(
              'mt-1 flex items-center gap-1.5 text-[11px] tabular-nums',
              mine ? 'justify-end text-paper/70' : 'text-paper-faint',
            )}
          >
            <span>{formatTime(message.createdAt)}</span>
            {/* Галочки только у своих: чужое «прочитано» ничего не сообщает */}
            {mine &&
              (pending ? null : message.readAt ? (
                <CheckCheck className="size-3.5" aria-label="Прочитано" />
              ) : (
                <Check className="size-3.5" aria-label="Отправлено" />
              ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Разделитель дня. Липкий: при прокрутке длинной переписки видно, где мы. */
export function DaySeparator({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 flex justify-center py-3">
      <span className="rounded-full border border-[var(--hairline)] bg-graphite-900/90 px-3 py-1 text-[11.5px] text-paper-faint backdrop-blur">
        {label}
      </span>
    </div>
  );
}
