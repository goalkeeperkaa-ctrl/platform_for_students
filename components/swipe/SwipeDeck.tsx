'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Inbox } from 'lucide-react';
import { SwipeCard } from './SwipeCard';
import { SwipeControls } from './SwipeControls';
import { VacancyDetail } from './VacancyDetail';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { CubeMark } from '@/components/brand/CubeMark';
import { durations, easeOutExpo, springSoft } from '@/lib/motion';
import { plural } from '@/lib/utils';
import type { SwipeDirection, VacancyDTO } from '@/lib/types';

interface HistoryEntry {
  vacancy: VacancyDTO;
  direction: SwipeDirection;
}

/**
 * Вернувшаяся карточка. `nonce` растёт на каждую отмену: одну и ту же
 * вакансию можно вернуть несколько раз подряд, и без отметки карточка
 * не отличит второй возврат от первого.
 */
interface Restored {
  id: string;
  from: 'left' | 'right';
  nonce: number;
}

/**
 * Лента свайпов.
 *
 * Решение применяется сразу, запрос уходит следом: ждать ответа сервера
 * ради анимации, которая уже началась, — значит превратить жест в
 * форму. Если запрос упал, карточка возвращается, и об этом говорят
 * прямо; молча потерянный отклик хуже видимой ошибки.
 */
export function SwipeDeck({ initial }: { initial: VacancyDTO[] }) {
  const router = useRouter();
  const toast = useToast();

  const [cards, setCards] = useState(initial);
  const [exitDir, setExitDir] = useState(1);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [detail, setDetail] = useState<VacancyDTO | null>(null);
  const [restored, setRestored] = useState<Restored | null>(null);
  const [counts, setCounts] = useState({ applied: 0, skipped: 0 });
  const [hintSeen, setHintSeen] = useState(false);

  const progress = useMotionValue(0);
  const total = useRef(initial.length);

  /*
   * Очередь и история живут в ref, а состояние — их отражение для
   * отрисовки.
   *
   * Решения приходят быстрее, чем React успевает перерисоваться: пока
   * летит запрос по предыдущей карточке, человек уже смахивает
   * следующую. Читая верхнюю карточку из состояния, оба жеста взяли бы
   * одну и ту же — поэтому раньше второй жест приходилось отбрасывать,
   * и смахнутая карточка оставалась лежать там, где её отпустили.
   */
  const queue = useRef(initial);
  const past = useRef<HistoryEntry[]>([]);
  const restoreSeq = useRef(0);

  /** Отправка решения. Отказ сервера возвращает карточку в колоду. */
  const send = useCallback(
    async (card: VacancyDTO, direction: SwipeDirection) => {
      try {
        const response = await fetch('/api/swipes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vacancyId: card.id, direction }),
        });
        const data = (await response.json().catch(() => ({}))) as { error?: string; pending?: boolean; reason?: 'EMAIL' | 'STUDY' };
        if (!response.ok) throw new Error(data.error);

        if (direction === 'RIGHT') {
          if (data.pending) {
            toast.success(
              'Отклик сохранён',
              data.reason === 'EMAIL'
                ? 'Уйдёт работодателю, когда вы подтвердите почту — код в письме'
                : 'Уйдёт работодателю, как только HR-менеджер подтвердит учёбу',
            );
          } else {
            toast.success('Отклик отправлен', `${card.title} · ${card.company}`);
          }
          // Раздел «Отклики» рендерится на сервере — обновляем его данные
          router.refresh();
        }
      } catch (error) {
        // Откатываем по вакансии, а не по хвосту истории: в полёте может
        // быть сразу несколько решений, и упасть способно любое из них
        queue.current = [card, ...queue.current];
        past.current = past.current.filter((entry) => entry.vacancy.id !== card.id);
        setCards(queue.current);
        setHistory(past.current);
        setCounts((c) =>
          direction === 'RIGHT' ? { ...c, applied: c.applied - 1 } : { ...c, skipped: c.skipped - 1 },
        );
        toast.error(
          'Не удалось сохранить решение',
          error instanceof Error && error.message ? error.message : 'Проверьте соединение',
        );
      }
    },
    [router, toast],
  );

  /**
   * Решение по верхней карточке. Возвращает, принято ли оно: карточка
   * блокирует себя только после согласия колоды, иначе жест, пришедший
   * на пустую колоду, оставил бы её замершей посреди экрана.
   */
  const decide = useCallback(
    (direction: SwipeDirection): boolean => {
      const card = queue.current[0];
      if (!card) return false;

      queue.current = queue.current.slice(1);
      past.current = [...past.current, { vacancy: card, direction }];
      setCards(queue.current);
      setHistory(past.current);
      setExitDir(direction === 'RIGHT' ? 1 : -1);
      setCounts((c) =>
        direction === 'RIGHT' ? { ...c, applied: c.applied + 1 } : { ...c, skipped: c.skipped + 1 },
      );
      setRestored(null);
      setHintSeen(true);
      progress.set(0);

      void send(card, direction);
      return true;
    },
    [progress, send],
  );

  const undo = useCallback(() => {
    const last = past.current[past.current.length - 1];
    if (!last) return;

    past.current = past.current.slice(0, -1);
    queue.current = [last.vacancy, ...queue.current];
    setHistory(past.current);
    setCards(queue.current);
    setRestored({
      id: last.vacancy.id,
      from: last.direction === 'RIGHT' ? 'right' : 'left',
      nonce: ++restoreSeq.current,
    });
    setCounts((c) =>
      last.direction === 'RIGHT'
        ? { ...c, applied: Math.max(0, c.applied - 1) }
        : { ...c, skipped: Math.max(0, c.skipped - 1) },
    );

    void (async () => {
      try {
        const response = await fetch('/api/swipes', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vacancyId: last.vacancy.id }),
        });
        if (!response.ok) throw new Error();
        router.refresh();
      } catch {
        toast.error('Не удалось отменить', 'Обновите страницу и попробуйте ещё раз');
      }
    })();
  }, [router, toast]);

  // Стрелки — полноценный способ разбирать ленту с клавиатуры, а не
  // подсказка «для доступности»: на десктопе им пользуются чаще мыши.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (detail) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        decide('LEFT');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        decide('RIGHT');
      } else if (event.key === 'ArrowUp' && cards[0]) {
        event.preventDefault();
        setDetail(cards[0]);
      } else if (event.key.toLowerCase() === 'z' && history.length) {
        event.preventDefault();
        undo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cards, decide, detail, history.length, undo]);

  const done = total.current - cards.length;

  return (
    <div className="flex w-full flex-col items-center">
      <DeckProgress done={done} total={total.current} counts={counts} />

      <div data-tour="deck" className="relative mt-5 h-[clamp(460px,64dvh,600px)] w-full max-w-[26rem]">
        {/* mode по умолчанию: улетающая карточка и поднимающаяся снизу
            должны двигаться одновременно, а не по очереди */}
        <AnimatePresence custom={exitDir}>
          {cards.slice(0, 3).map((vacancy, index) => (
            <SwipeCard
              key={vacancy.id}
              vacancy={vacancy}
              index={index}
              isTop={index === 0}
              enterFrom={restored?.id === vacancy.id ? restored.from : 'stack'}
              entryToken={restored?.id === vacancy.id ? restored.nonce : 0}
              onDecide={decide}
              onOpen={() => setDetail(vacancy)}
              onProgress={(value) => progress.set(value)}
            />
          ))}
        </AnimatePresence>

        {cards.length === 0 && <EmptyDeck applied={counts.applied} />}
      </div>

      <div className="mt-7 w-full max-w-[26rem]">
        <SwipeControls
          progress={progress}
          onSkip={() => decide('LEFT')}
          onApply={() => decide('RIGHT')}
          onUndo={undo}
          canUndo={history.length > 0}
          disabled={cards.length === 0}
        />

        <AnimatePresence>
          {!hintSeen && cards.length > 0 && (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: durations.base, ease: easeOutExpo, delay: 0.6 }}
              className="mt-5 flex items-center justify-center gap-2 text-center text-[12.5px] text-paper-faint"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Смахните карточку или нажмите стрелку
              <ArrowRight className="size-3.5" aria-hidden />
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <VacancyDetail vacancy={detail} onClose={() => setDetail(null)} onDecide={decide} />
    </div>
  );
}

function DeckProgress({
  done,
  total,
  counts,
}: {
  done: number;
  total: number;
  counts: { applied: number; skipped: number };
}) {
  const ratio = total > 0 ? Math.min(1, done / total) : 1;

  return (
    <div className="w-full max-w-[26rem]">
      <div className="flex items-baseline justify-between text-[12.5px]">
        <span className="text-paper-faint">
          {total - done > 0
            ? `${total - done} ${plural(total - done, 'вакансия', 'вакансии', 'вакансий')} в подборке`
            : 'Подборка разобрана'}
        </span>
        <span className="flex items-center gap-3 tabular-nums">
          <span className="flex items-center gap-1 text-yes-glow">
            <Check className="size-3" aria-hidden />
            {counts.applied}
          </span>
          <span className="text-paper-faint">{counts.skipped} пропущено</span>
        </span>
      </div>

      <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-paper/[0.07]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-300"
          initial={false}
          animate={{ scaleX: ratio }}
          style={{ transformOrigin: 'left' }}
          transition={springSoft}
        />
      </div>
    </div>
  );
}

function EmptyDeck({ applied }: { applied: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...springSoft, delay: 0.15 }}
      className="glass absolute inset-0 flex flex-col items-center justify-center gap-5 rounded-4xl p-8 text-center"
    >
      <CubeMark className="h-20 w-20 text-paper/25" />
      <div className="space-y-2">
        <h3 className="text-display-sm text-paper">Подборка закончилась</h3>
        <p className="mx-auto max-w-[22rem] text-[14px] leading-relaxed text-paper-dim">
          {applied > 0
            ? `Вы отправили ${applied} ${plural(applied, 'отклик', 'отклика', 'откликов')}. Работодатели ответят в течение двух рабочих дней — следите за разделом «Отклики».`
            : 'Новые вакансии появляются каждый день. Загляните завтра или посмотрите пропущенные — их можно вернуть в ленту.'}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/skipped">
          <Button variant="outline" size="sm">
            Пропущенные
          </Button>
        </Link>
        <Link href="/applications">
          <Button variant="ghost" size="sm" icon={<Inbox />}>
            Мои отклики
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}
