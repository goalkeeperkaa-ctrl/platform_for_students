'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TOURS, TOUR_START_EVENT, type TourStep } from '@/lib/tour';
import type { Role } from '@/lib/types';

const CHECKED_KEY = 'fhr_tour_checked';
const FORCE_KEY = 'fhr_tour_force';

function readStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* приватный режим — просто не запоминаем */
  }
}

/** Первый видимый элемент шага: на телефоне вкладки дублируются, и скрытая копия не годится. */
function findTarget(target: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`));
  return (
    nodes.find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) ?? null
  );
}

/**
 * Инструкция для нового пользователя.
 *
 * Сама решает, показываться ли: спрашивает сервер один раз за сессию
 * браузера, видел ли человек тур, и стартует только на главной странице
 * кабинета — там есть всё, на что показывают шаги. Кнопка «?» запускает тур
 * заново: если человек не на главной, сначала переходим туда.
 */
export function TourController() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [steps, setSteps] = useState<TourStep[] | null>(null);

  const open = useCallback((forRole: Role) => {
    // Даём странице дорисоваться: колода и плашки появляются после гидратации
    window.setTimeout(() => {
      const available = TOURS[forRole].steps.filter((step) => findTarget(step.target));
      if (available.length > 0) setSteps(available);
    }, 450);
  }, []);

  const fetchState = useCallback(async (): Promise<{ seen: boolean; role: Role } | null> => {
    try {
      const response = await fetch('/api/tour', { cache: 'no-store' });
      if (!response.ok) return null;
      return (await response.json()) as { seen: boolean; role: Role };
    } catch {
      return null;
    }
  }, []);

  // Автозапуск и запуск после перехода на главную по кнопке «?»
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const forced = readStorage(FORCE_KEY) === '1';
      if (!forced && readStorage(CHECKED_KEY) === '1') return;
      const state = await fetchState();
      if (!state || cancelled) return;
      setRole(state.role);
      writeStorage(CHECKED_KEY, '1');
      if (pathname !== TOURS[state.role].home) return;
      if (forced || !state.seen) {
        writeStorage(FORCE_KEY, null);
        open(state.role);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, fetchState, open]);

  // Кнопка «?» и страница помощи
  useEffect(() => {
    async function onStart() {
      const current = role ?? (await fetchState())?.role ?? null;
      if (!current) return;
      setRole(current);
      if (pathname === TOURS[current].home) {
        open(current);
      } else {
        writeStorage(FORCE_KEY, '1');
        router.push(TOURS[current].home);
      }
    }
    window.addEventListener(TOUR_START_EVENT, onStart);
    return () => window.removeEventListener(TOUR_START_EVENT, onStart);
  }, [role, pathname, router, fetchState, open]);

  function finish() {
    setSteps(null);
    void fetch('/api/tour', { method: 'POST' }).catch(() => null);
  }

  if (!steps) return null;
  return <TourOverlay steps={steps} onFinish={finish} />;
}

function TourOverlay({ steps, onFinish }: { steps: TourStep[]; onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  useLayoutEffect(() => {
    const node = findTarget(step.target);
    node?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });

    let frame = 0;
    const started = performance.now();
    const measure = () => {
      const current = findTarget(step.target);
      setRect(current ? current.getBoundingClientRect() : null);
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      // Плавная прокрутка идёт долю секунды — провожаем элемент, пока она не закончится
      if (performance.now() - started < 700) frame = requestAnimationFrame(measure);
    };
    measure();
    const onChange = () => measure();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    nextRef.current?.focus();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [step.target]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onFinish();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFinish]);

  const pad = 6;
  const narrow = viewport.width < 640;
  const cardWidth = Math.min(352, viewport.width - 24);
  const below = rect ? viewport.height - rect.bottom > 230 : true;

  const cardStyle: React.CSSProperties = narrow
    ? rect && rect.top > viewport.height / 2
      ? { top: 12, left: 12, right: 12 }
      : { bottom: 12, left: 12, right: 12 }
    : {
        width: cardWidth,
        left: rect ? Math.min(Math.max(12, rect.left), viewport.width - cardWidth - 12) : (viewport.width - cardWidth) / 2,
        ...(rect
          ? below
            ? { top: rect.bottom + pad + 10 }
            : { top: rect.top - pad - 10, transform: 'translateY(-100%)' }
          : { top: viewport.height / 3 }),
      };

  return createPortal(
    <div className="fixed inset-0 z-[120]" aria-live="polite">
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-2xl border-2 border-accent-300/80 transition-all duration-300 ease-out"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(8, 9, 11, 0.72)',
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-ink/70" />
      )}

      <div
        role="dialog"
        aria-label={`Инструкция, шаг ${index + 1} из ${steps.length}: ${step.title}`}
        className="fixed rounded-3xl border border-[var(--hairline)] bg-graphite-900 p-5 shadow-2xl"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11.5px] uppercase tracking-[0.12em] text-accent-300">
            Шаг {index + 1} из {steps.length}
          </p>
          <button
            type="button"
            onClick={onFinish}
            aria-label="Закрыть инструкцию"
            className="-mr-1 -mt-1 grid size-8 place-items-center rounded-full text-paper/60 transition-colors hover:bg-paper/[0.06] hover:text-paper"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <h2 className="mt-1.5 text-[16.5px] font-semibold tracking-[-0.02em] text-paper">{step.title}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-paper-dim">{step.text}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onFinish}>
            Пропустить
          </Button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="outline" size="sm" onClick={() => setIndex((i) => i - 1)}>
                Назад
              </Button>
            )}
            <Button
              ref={nextRef}
              variant="accent"
              size="sm"
              onClick={() => (last ? onFinish() : setIndex((i) => i + 1))}
            >
              {last ? 'Понятно' : 'Далее'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
