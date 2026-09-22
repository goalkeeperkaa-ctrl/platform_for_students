'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { easeOutExpo } from '@/lib/motion';

/**
 * Кольцо совпадения.
 *
 * Дуга прочерчивается один раз при появлении карточки. Число внутри —
 * не украшение: это единственное место, где студент видит, почему
 * вакансия оказалась наверху ленты.
 */
export function MatchRing({
  value,
  size = 44,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const stroke = size >= 44 ? 3 : 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, value)) / 100;

  // Порог, а не градиент: «68%» и «72%» не должны выглядеть по-разному
  const tone = value >= 75 ? '#71D9AC' : value >= 50 ? '#8DA3B9' : '#6B7278';

  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      title={`Совпадение с вашим профилем — ${value}%`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(248,248,248,0.1)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={reduced ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - progress) }}
          transition={{ duration: 1.1, ease: easeOutExpo, delay: 0.15 }}
        />
      </svg>
      {/* Кольцо всегда лежит на тёмной подложке-баннере компании (см.
          SwipeCard/VacancyDetail) — фиксированный белый, не paper. */}
      <span
        className="absolute font-medium tabular-nums leading-none text-white"
        style={{ fontSize: size * 0.29 }}
      >
        {Math.round(value)}
      </span>
    </span>
  );
}
