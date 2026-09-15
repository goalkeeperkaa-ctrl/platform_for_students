'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { durations, easeOutExpo } from '@/lib/motion';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Модальное окно: на телефоне — лист снизу, на компьютере — по центру.
 *
 * Рендерится в body через портал. Внутри мастера регистрации шаги
 * анимируются трансформом, а трансформ у предка ломает position: fixed —
 * окно открывалось бы внутри шага, а не поверх экрана.
 *
 * Фокус заперт внутри, Escape и клик по фону закрывают, после закрытия
 * фокус возвращается туда, откуда окно открыли: иначе человек с клавиатуры
 * оказывается в начале страницы.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // onClose в ref: родитель передаёт новую функцию на каждый рендер, и
  // эффект ниже иначе перезапускался бы, сбрасывая фокус и прокрутку
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      returnTo?.focus?.();
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="dialog"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: durations.fast }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/75 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: durations.base, ease: easeOutExpo }}
            className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--hairline)] bg-graphite-900 shadow-2xl outline-none sm:max-h-[85dvh] sm:w-[min(42rem,100%)] sm:rounded-3xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[var(--hairline)] px-5 py-4 sm:px-7">
              <h2 id={titleId} className="min-w-0 break-words text-[17px] font-semibold tracking-[-0.02em] text-paper">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--hairline)] text-paper/70 transition-colors hover:border-paper/30 hover:text-paper"
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">{children}</div>

            {footer && (
              <footer className="flex flex-col-reverse gap-2 border-t border-[var(--hairline)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:justify-end sm:px-7">
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
