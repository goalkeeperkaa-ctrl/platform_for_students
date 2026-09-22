'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, Flame, Gift, GraduationCap, MapPin, PlayCircle, Sparkles, Users, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Tag } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { MatchRing } from './MatchRing';
import { durations, easeOutExpo, springSoft } from '@/lib/motion';
import { companyGradient, formatSalary } from '@/lib/utils';
import { mapUrl } from '@/lib/vacancy';
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

/**
 * Подробности вакансии.
 *
 * На телефоне — шторка снизу, на десктопе — окно по центру: в обоих
 * случаях лист приезжает оттуда, где палец или курсор только что были.
 * Прокрутка страницы под шторкой блокируется, иначе фон уезжает вместе
 * с содержимым шторки.
 */
export function VacancyDetail({
  vacancy,
  onClose,
  onDecide,
}: {
  vacancy: VacancyDTO | null;
  onClose: () => void;
  onDecide?: (direction: SwipeDirection) => void;
}) {
  useEffect(() => {
    if (!vacancy) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [vacancy, onClose]);

  return (
    <AnimatePresence>
      {vacancy && (
        <motion.div
          className="fixed inset-0 z-[65] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: durations.fast, ease: easeOutExpo }}
        >
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-ink/72 backdrop-blur-md"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={vacancy.title}
            initial={{ y: '6%', scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: '4%', scale: 0.98, opacity: 0 }}
            transition={springSoft}
            className="glass-card relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-4xl sm:max-h-[86dvh] sm:max-w-2xl sm:rounded-4xl"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-55"
              style={{ background: companyGradient(vacancy.company) }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-transparent to-graphite-900/90"
            />

            {/* Ручка шторки: подсказывает, что лист можно закрыть смахиванием */}
            <div className="relative flex justify-center pt-3 sm:hidden">
              <span className="h-1 w-10 rounded-full bg-paper/25" />
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="absolute right-4 top-4 z-10 rounded-full border border-[var(--hairline)] bg-graphite-900/70 p-2 text-paper/70 backdrop-blur transition-colors hover:bg-graphite-800 hover:text-paper"
            >
              <X className="size-4" />
            </button>

            <div className="relative overflow-y-auto overscroll-contain px-6 pb-6 pt-6 sm:px-8">
              {/*
                Имя и город компании лежат на companyGradient (см. выше) —
                он всегда тёмный независимо от темы страницы, поэтому текст
                здесь тоже фиксированный светлый, а не paper: тот в светлой
                теме становится тёмным и пропадает на этой подложке (тот же
                баг, что был с инициалами в Avatar).
              */}
              <header className="flex items-start gap-4">
                <Avatar name={vacancy.company} src={vacancy.companyLogoUrl} size={52} rounded="square" />
                <div className="min-w-0 flex-1">
                  {vacancy.companyId ? (
                    <Link
                      href={`/companies/${vacancy.companyId}`}
                      className="text-[14px] font-medium text-white/90 underline-offset-4 transition-colors hover:text-white hover:underline"
                    >
                      {vacancy.company}
                    </Link>
                  ) : (
                    <p className="text-[14px] font-medium text-white/90">{vacancy.company}</p>
                  )}
                  <p className="mt-1 flex items-center gap-1.5 text-[13px] text-white/60">
                    <MapPin className="size-3.5" aria-hidden />
                    {vacancy.city}
                    {vacancy.district ? `, ${vacancy.district}` : ''}
                  </p>
                </div>
                {vacancy.matchScore !== null && <MatchRing value={vacancy.matchScore} size={52} />}
              </header>

              <h2 className="mt-6 text-display-sm text-paper">{vacancy.title}</h2>

              <p className="mt-3 text-[19px] font-medium text-accent-200">
                {formatSalary(vacancy.salaryFrom, vacancy.salaryTo)}
                <span className="ml-2 text-[14px] font-normal text-paper-faint">
                  {PERIOD_LABEL[vacancy.salaryPeriod]}
                </span>
              </p>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <Tag tone="accent">{WORK_FORMAT_LABEL[vacancy.workFormat]}</Tag>
                <Tag>{EMPLOYMENT_TYPE_LABEL[vacancy.employmentType]}</Tag>
                {vacancy.isHot && (
                  <Tag tone="hot">
                    <Flame className="size-3" aria-hidden /> Срочно
                  </Tag>
                )}
                {vacancy.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </div>

              {vacancy.matchReasons.length > 0 && (
                <div className="mt-6 rounded-2xl border border-accent-500/25 bg-accent-500/[0.07] p-4">
                  <p className="flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] text-accent-200">
                    <Sparkles className="size-3.5" aria-hidden />
                    Почему подходит вам
                  </p>
                  <ul className="mt-2.5 space-y-1.5">
                    {vacancy.matchReasons.map((reason) => (
                      <li key={reason} className="text-[13.5px] leading-snug text-paper-dim">
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {vacancy.address && (
                <div className="mt-6 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[var(--hairline)] bg-graphite-900/45 p-4">
                  <p className="flex min-w-0 items-start gap-2 text-[14px] leading-snug text-paper">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-accent-300" aria-hidden />
                    <span className="min-w-0 break-words">
                      {vacancy.city}, {vacancy.address}
                      {vacancy.addressDetails && (
                        <span className="block text-[12.5px] text-paper-faint">{vacancy.addressDetails}</span>
                      )}
                    </span>
                  </p>
                  <a
                    href={mapUrl(vacancy.city, vacancy.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[13px] text-accent-200 underline-offset-4 transition-colors hover:text-paper hover:underline"
                  >
                    Открыть на карте
                  </a>
                </div>
              )}

              <p className="mt-6 text-[15px] leading-relaxed text-paper-dim">{vacancy.summary}</p>

              <Section title="Что делать" items={vacancy.responsibilities} icon={<Check className="size-3.5" />} />
              <Section title="Что нужно от вас" items={vacancy.requirements} icon={<Check className="size-3.5" />} />
              <Section title="Чему научитесь" items={vacancy.learnings} icon={<GraduationCap className="size-3.5" />} />
              {vacancy.team && (
                <section className="mt-7">
                  <h3 className="text-eyebrow uppercase text-paper-faint">С кем будете работать</h3>
                  <p className="mt-3 flex items-start gap-2.5 text-[14.5px] leading-relaxed text-paper-dim">
                    <Users className="mt-1 size-3.5 shrink-0 text-accent-300" aria-hidden />
                    <span className="min-w-0 whitespace-pre-line break-words">{vacancy.team}</span>
                  </p>
                </section>
              )}
              <Section title="Условия" items={vacancy.perks} icon={<Gift className="size-3.5" />} />

              {vacancy.photos.length > 0 && (
                <section className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label="Фото с места работы">
                  {vacancy.photos.map((src) => (
                    <div
                      key={src}
                      className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--hairline)]"
                    >
                      <Image src={src} alt="" fill unoptimized sizes="(min-width: 640px) 200px, 45vw" className="object-cover" />
                    </div>
                  ))}
                </section>
              )}

              {vacancy.videoUrl && vacancy.videoUrl.startsWith('/api/files/companyVideo/') && (
                // eslint-disable-next-line jsx-a11y/media-has-caption -- видео о вакансии без субтитров
                <video src={vacancy.videoUrl} controls className="mt-7 w-full max-w-sm rounded-2xl border border-[var(--hairline)]" />
              )}

              {vacancy.videoUrl && /^https?:\/\//i.test(vacancy.videoUrl) && (
                <a
                  href={vacancy.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow ugc"
                  className="mt-7 inline-flex max-w-full items-center gap-2 rounded-xl border border-[var(--hairline)] bg-graphite-900/45 px-3.5 py-2.5 text-[13.5px] text-paper/85 transition-colors hover:border-paper/25 hover:text-paper"
                >
                  <PlayCircle className="size-4 shrink-0" aria-hidden />
                  Видео о работе
                </a>
              )}

              <div className="mt-7 flex items-center gap-2 text-[13px] text-paper-faint">
                <Clock className="size-3.5 shrink-0" aria-hidden />
                <span>
                  Смены: {vacancy.shiftDays.map((d) => WEEKDAY_LABEL[d]).join(', ')}
                  {vacancy.hoursPerWeek ? ` · до ${vacancy.hoursPerWeek} часов в неделю` : ''}
                </span>
              </div>
            </div>

            {onDecide && (
              <div className="relative flex gap-3 border-t border-[var(--hairline)] bg-graphite-950/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-glass sm:px-8">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={() => {
                    onClose();
                    onDecide('LEFT');
                  }}
                >
                  Пропустить
                </Button>
                <Button
                  variant="accent"
                  size="lg"
                  className="flex-[1.5]"
                  onClick={() => {
                    onClose();
                    onDecide('RIGHT');
                  }}
                >
                  Откликнуться
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({
  title,
  items,
  icon,
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-7">
      <h3 className="text-eyebrow uppercase text-paper-faint">{title}</h3>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-paper-dim">
            <span className="mt-1 shrink-0 text-accent-300">{icon}</span>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
