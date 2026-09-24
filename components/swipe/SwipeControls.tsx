'use client';

import { motion, useTransform, type MotionValue } from 'framer-motion';
import { RotateCcw, Sparkles, X } from 'lucide-react';
import { springSnappy } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Кнопки решения.
 *
 * Кнопка растёт и подсвечивается в такт тому, куда ведут карточку: это
 * связывает жест и кнопку в одно действие, и человек понимает, что
 * произойдёт, ещё до того, как отпустит палец.
 */
export function SwipeControls({
  progress,
  onSkip,
  onApply,
  onUndo,
  canUndo,
  disabled,
  labels = { skip: 'Пропустить вакансию', undo: 'Вернуть предыдущую вакансию', apply: 'Откликнуться на вакансию' },
}: {
  progress: MotionValue<number>;
  onSkip: () => void;
  onApply: () => void;
  onUndo: () => void;
  canUndo: boolean;
  disabled?: boolean;
  /** Подписи для скринридера — по умолчанию под ленту студента, для других колод переопределяются */
  labels?: { skip: string; undo: string; apply: string };
}) {
  const skipScale = useTransform(progress, [-1, 0], [1.16, 1]);
  const skipGlow = useTransform(progress, [-1, -0.1], [1, 0]);
  const applyScale = useTransform(progress, [0, 1], [1, 1.16]);
  const applyGlow = useTransform(progress, [0.1, 1], [0, 1]);

  return (
    <div className="flex items-center justify-center gap-5">
      <motion.button
        type="button"
        onClick={onSkip}
        disabled={disabled}
        aria-label={labels.skip}
        style={{ scale: skipScale }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.9 }}
        transition={springSnappy}
        className={cn(
          'relative grid size-14 place-items-center rounded-full border border-[var(--hairline-strong)]',
          'bg-graphite-850/80 text-paper/75 backdrop-blur-glass transition-colors',
          'hover:border-paper/30 hover:text-paper disabled:opacity-40',
        )}
      >
        <motion.span
          aria-hidden
          style={{ opacity: skipGlow }}
          className="absolute inset-0 rounded-full ring-2 ring-paper/40"
        />
        <X className="size-5" />
      </motion.button>

      <motion.button
        type="button"
        onClick={onUndo}
        disabled={disabled || !canUndo}
        aria-label={labels.undo}
        whileHover={{ y: -2, rotate: -18 }}
        whileTap={{ scale: 0.9 }}
        transition={springSnappy}
        className="grid size-11 place-items-center rounded-full border border-[var(--hairline)] bg-graphite-900/60 text-paper/55 backdrop-blur transition-colors hover:text-paper disabled:pointer-events-none disabled:opacity-25"
      >
        <RotateCcw className="size-4" />
      </motion.button>

      <motion.button
        type="button"
        onClick={onApply}
        disabled={disabled}
        aria-label={labels.apply}
        style={{ scale: applyScale }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.9 }}
        transition={springSnappy}
        className={cn(
          'relative grid size-14 place-items-center rounded-full border border-yes/45',
          'bg-yes-deep/80 text-yes-glow backdrop-blur-glass transition-colors',
          'hover:border-yes-glow/70 disabled:opacity-40',
        )}
      >
        <motion.span
          aria-hidden
          style={{ opacity: applyGlow }}
          className="absolute inset-0 rounded-full shadow-glow-yes ring-2 ring-yes-glow/70"
        />
        <Sparkles className="size-5" />
      </motion.button>
    </div>
  );
}
