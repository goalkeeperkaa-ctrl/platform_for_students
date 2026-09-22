'use client';

import { useEffect, useRef } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from 'framer-motion';
import { Clock, Flame, MapPin, Sparkles } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Tag } from '@/components/ui/Chip';
import { MatchRing } from './MatchRing';
import { SWIPE, springDeck, springSoft } from '@/lib/motion';
import { cn, companyGradient, formatSalary } from '@/lib/utils';
import {
  EMPLOYMENT_TYPE_LABEL,
  WEEKDAY_LABEL,
  WORK_FORMAT_LABEL,
  type SwipeDirection,
  type VacancyDTO,
} from '@/lib/types';

const PERIOD_LABEL: Record<VacancyDTO['salaryPeriod'], string> = {
  MONTH: 'в месяц',
  SHIFT: 'за смену',
  HOUR: 'в час',
};

export interface SwipeCardProps {
  vacancy: VacancyDTO;
  /** 0 — верхняя карточка, дальше вглубь стопки */
  index: number;
  isTop: boolean;
  /** Возвращает, приняла ли колода решение */
  onDecide: (direction: SwipeDirection) => boolean;
  onOpen: () => void;
  /** Сообщает колоде, насколько уведена верхняя карточка (−1…1) */
  onProgress?: (progress: number) => void;
  /**
   * Откуда карточка появляется. Новая приходит из глубины стопки, а
   * возвращённая кнопкой «отменить» — с того края, куда её только что
   * отправили: иначе отмена не читается как отмена.
   */
  enterFrom?: 'stack' | 'left' | 'right';
  /**
   * Метка возврата. Меняется на каждую отмену, в том числе повторную по
   * той же вакансии, и служит сигналом «решение по тебе отменено».
   */
  entryToken?: number;
}

/**
 * Карточка вакансии.
 *
 * Физика броска: наклон пропорционален смещению, но домножен на то, где
 * карточку взяли — у края она разворачивается сильнее, чем в центре.
 * Это единственное, что отличает «двигается картинка» от «двигается
 * предмет».
 *
 * Решение засчитывается по расстоянию ИЛИ по скорости. Только расстояние —
 * и быстрый короткий флик не срабатывает; только скорость — и медленное
 * уверенное перетаскивание до края экрана ничего не делает.
 */
export function SwipeCard({
  vacancy,
  index,
  isTop,
  onDecide,
  onOpen,
  onProgress,
  enterFrom = 'stack',
  entryToken = 0,
}: SwipeCardProps) {
  const reduced = useReducedMotion();
  // Возвращённая карточка стартует за краем экрана и приезжает на место
  // пружиной — это и есть визуальная отмена решения.
  const entryX = enterFrom === 'stack' ? 0 : enterFrom === 'right' ? 520 : -520;
  const x = useMotionValue(entryX);
  /** Множитель наклона: 0.55 при захвате по центру, до 1.45 у краёв */
  const grab = useMotionValue(1);
  const decided = useRef(false);

  useEffect(() => {
    // Карточку вернули кнопкой «отменить»: снимаем замок решения и
    // приводим её на место. Без сброса замка карточка, возвращённая до
    // конца вылета, больше не отзывалась бы ни на один жест, а без
    // возврата по x осталась бы лежать за краем экрана.
    decided.current = false;
    if (x.get() !== 0) animate(x, 0, springSoft);
    // Вход, а не каждый кадр: дальше x принадлежит жесту
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryToken]);

  const rotate = useTransform<number, number>([x, grab], ([value, factor]) => {
    const raw = (value / 240) * SWIPE.maxRotate * factor;
    return Math.max(-SWIPE.maxRotate * 1.7, Math.min(SWIPE.maxRotate * 1.7, raw));
  });

  const yesOpacity = useTransform(x, [28, 132], [0, 1]);
  const noOpacity = useTransform(x, [-132, -28], [1, 0]);
  const yesGlow = useTransform(x, [0, 180], [0, 1]);
  const noShade = useTransform(x, [-180, 0], [0.72, 0]);

  useMotionValueEvent(x, 'change', (value) => {
    if (isTop && onProgress) onProgress(Math.max(-1, Math.min(1, value / 180)));
  });

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    // −1 у верхней кромки, +1 у нижней
    const offset = (event.clientY - (box.top + box.height / 2)) / (box.height / 2);
    grab.set(0.55 + Math.min(1, Math.abs(offset)) * 0.9);
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (decided.current) return;

    const fast = Math.abs(info.velocity.x) > SWIPE.velocityThreshold;
    const far = Math.abs(info.offset.x) > SWIPE.distanceThreshold;
    if (!fast && !far) {
      animate(x, 0, springSoft);
      onProgress?.(0);
      return;
    }

    // Скорость главнее смещения: карточку могли толкнуть обратно перед отпусканием
    const sign = fast ? Math.sign(info.velocity.x) : Math.sign(info.offset.x);

    // Замок ставим только после согласия колоды. Решение могут не
    // принять — например, карточка уже ушла другим жестом; тогда её
    // надо вернуть, иначе она замрёт там, где её отпустили, и перестанет
    // отзываться на что-либо.
    if (!onDecide(sign > 0 ? 'RIGHT' : 'LEFT')) {
      animate(x, 0, springSoft);
      onProgress?.(0);
      return;
    }
    decided.current = true;
  }

  const depth = Math.min(index, 2);

  // Формат работы и тип занятости уже показаны отдельными чипами: «Удалённо»
  // дважды подряд читается как ошибка вёрстки, а не как акцент.
  const shown = new Set([
    WORK_FORMAT_LABEL[vacancy.workFormat].toLowerCase(),
    EMPLOYMENT_TYPE_LABEL[vacancy.employmentType].toLowerCase(),
  ]);
  const extraTags = vacancy.tags.filter((tag) => !shown.has(tag.toLowerCase()));

  return (
    <motion.div
      className={cn(
        'absolute inset-0 touch-pan-y-only will-change-transform',
        isTop ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none',
      )}
      style={{ x, rotate, zIndex: 40 - index }}
      drag={isTop && !reduced ? 'x' : false}
      dragMomentum={false}
      dragElastic={1}
      onPointerDown={handlePointerDown}
      onDragEnd={handleDragEnd}
      initial={
        enterFrom === 'stack'
          ? { scale: 0.86, y: 52, opacity: 0 }
          : { scale: 1, y: 0, opacity: 0 }
      }
      animate={{
        scale: 1 - depth * 0.05,
        y: depth * 18,
        opacity: index > 2 ? 0 : 1,
      }}
      // Вылет — динамический вариант: направление приходит из AnimatePresence
      // через custom, потому что карточка на момент удаления уже не знает,
      // куда её отправили — решение приняла колода.
      variants={{
        fly: (direction: number) => ({
          x: direction * (typeof window === 'undefined' ? 1200 : window.innerWidth * SWIPE.flyOut),
          opacity: 0,
          transition: {
            x: { type: 'spring', stiffness: 140, damping: 22, restDelta: 24 },
            opacity: { duration: 0.24, delay: 0.14 },
          },
        }),
      }}
      exit="fly"
      transition={springDeck}
    >
      <article
        className={cn(
          'glass-card relative flex h-full w-full flex-col overflow-hidden rounded-4xl',
          isTop && 'shadow-lift',
        )}
      >
        {/* Подложка в фирменном оттенке компании — узнаваемость без логотипа */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-44 opacity-60"
          style={{ background: companyGradient(vacancy.company) }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-transparent to-graphite-950/85"
        />

        {/* Подсветка решения. Вправо — зелёная кромка, влево — затемнение:
            согласие светится, отказ гаснет. */}
        <motion.div
          aria-hidden
          style={{ opacity: yesGlow }}
          className="pointer-events-none absolute inset-0 rounded-4xl ring-2 ring-inset ring-yes-glow/70 shadow-glow-yes"
        />
        <motion.div
          aria-hidden
          style={{ opacity: noShade }}
          className="pointer-events-none absolute inset-0 rounded-4xl bg-ink/75 ring-1 ring-inset ring-paper/10"
        />

        <div className="relative flex h-full flex-col p-6 sm:p-7">
          {/*
            Имя и город компании лежат на companyGradient (см. выше) — он
            всегда тёмный независимо от темы страницы, поэтому текст здесь
            тоже фиксированный светлый, а не paper: тот в светлой теме
            становится тёмным и пропадает на этой подложке (тот же баг,
            что был с инициалами в Avatar).
          */}
          <header className="flex items-start gap-3.5">
            <Avatar
              name={vacancy.company}
              src={vacancy.companyLogoUrl}
              size={46}
              rounded="square"
            />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="truncate text-[13.5px] font-medium text-white/90">{vacancy.company}</p>
              <p className="mt-0.5 flex items-center gap-1 truncate text-[12.5px] text-white/60">
                <MapPin className="size-3 shrink-0" aria-hidden />
                {vacancy.city}
                {vacancy.district ? `, ${vacancy.district}` : ''}
              </p>
            </div>
            {vacancy.matchScore !== null && <MatchRing value={vacancy.matchScore} />}
          </header>

          <h2 className="mt-5 text-[clamp(1.375rem,4.4vw,1.75rem)] font-semibold leading-[1.1] tracking-[-0.028em] text-paper">
            {vacancy.title}
          </h2>

          <p className="mt-2.5 text-[15px] font-medium text-accent-200">
            {formatSalary(vacancy.salaryFrom, vacancy.salaryTo)}
            <span className="ml-1.5 text-[13px] font-normal text-paper-faint">
              {PERIOD_LABEL[vacancy.salaryPeriod]}
            </span>
          </p>

          <div className="hairline-x my-5" />

          <p className="line-clamp-3 text-[14px] leading-relaxed text-paper-dim">{vacancy.summary}</p>

          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="size-3.5 shrink-0 text-paper-faint" aria-hidden />
              <div className="flex flex-wrap gap-1">
                {vacancy.shiftDays.map((day) => (
                  <span
                    key={day}
                    className="rounded-md bg-paper/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-paper/70"
                  >
                    {WEEKDAY_LABEL[day]}
                  </span>
                ))}
                {vacancy.hoursPerWeek && (
                  <span className="px-1 py-0.5 text-[11px] text-paper-faint">
                    · до {vacancy.hoursPerWeek} ч/нед
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Tag tone="accent">{WORK_FORMAT_LABEL[vacancy.workFormat]}</Tag>
              <Tag>{EMPLOYMENT_TYPE_LABEL[vacancy.employmentType]}</Tag>
              {vacancy.isHot && (
                <Tag tone="hot">
                  <Flame className="size-3" aria-hidden />
                  Срочно
                </Tag>
              )}
              {extraTags.slice(0, 2).map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          </div>

          {vacancy.matchReasons.length > 0 && (
            <ul className="mt-5 space-y-1.5">
              {vacancy.matchReasons.map((reason, index) => (
                <li
                  key={reason}
                  className="flex items-start gap-1.5 text-[12.5px] leading-snug text-paper-faint"
                >
                  <Sparkles
                    className={cn('mt-px size-3.5 shrink-0', index === 0 ? 'text-accent-300' : 'opacity-0')}
                    aria-hidden
                  />
                  {reason}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={onOpen}
            disabled={!isTop}
            className="mt-auto pt-5 text-left text-[13px] font-medium text-paper/55 underline-offset-4 transition-colors hover:text-paper hover:underline"
          >
            Подробнее об условиях
          </button>
        </div>

        {/* Штампы решения. Наклон и жёсткая рамка — как оттиск на бумаге */}
        <motion.div
          aria-hidden
          style={{ opacity: yesOpacity }}
          className="pointer-events-none absolute left-6 top-8 -rotate-[14deg] rounded-xl border-[3px] border-yes-glow px-3.5 py-1.5 text-[15px] font-bold uppercase tracking-[0.1em] text-yes-glow"
        >
          Отклик
        </motion.div>
        <motion.div
          aria-hidden
          style={{ opacity: noOpacity }}
          className="pointer-events-none absolute right-6 top-8 rotate-[14deg] rounded-xl border-[3px] border-paper/45 px-3.5 py-1.5 text-[15px] font-bold uppercase tracking-[0.1em] text-paper/70"
        >
          Позже
        </motion.div>
      </article>
    </motion.div>
  );
}
