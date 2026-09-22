'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Building2, CalendarCheck, Hand, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { CubeMark } from '@/components/brand/CubeMark';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Chip';
import { CountUp } from '@/components/motion/CountUp';
import { Reveal, Stagger } from '@/components/motion/Reveal';
import { SplitText, SplitTextInView } from '@/components/motion/SplitText';
import { useCurtainNav } from '@/components/motion/RouteCurtain';
import { DemoDeck } from './DemoDeck';
import { durations, easeOutExpo, fadeUp } from '@/lib/motion';
import type { VacancyDTO } from '@/lib/types';

const STEPS = [
  {
    icon: <CalendarCheck className="size-5" />,
    title: 'Профиль за три минуты',
    body: 'Вуз, специальность, свободные дни и навыки. Шесть коротких шагов — дальше подбор идёт сам.',
  },
  {
    icon: <Hand className="size-5" />,
    title: 'Смахивайте вакансии',
    body: 'Вправо — отклик уходит работодателю сразу. Влево — вакансия уходит в «Пропущенные», откуда её всегда можно вернуть.',
  },
  {
    icon: <Building2 className="size-5" />,
    title: 'Работодатель отвечает',
    body: 'Компания видит ваш профиль и резюме в своём кабинете. Статус отклика меняется у вас на глазах — без переписок и звонков.',
  },
];

export function Landing({
  vacancies,
  companies,
  agencyUrl,
}: {
  vacancies: VacancyDTO[];
  companies: string[];
  /** Сайт агентства; null — адрес на проде не задан, ссылки нет */
  agencyUrl: string | null;
}) {
  const navigate = useCurtainNav();

  return (
    <div className="relative">
      <header className="page-x absolute inset-x-0 top-0 z-40 mx-auto flex h-[var(--header-h)] max-w-7xl items-center justify-between">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: durations.base, ease: easeOutExpo }}
        >
          <Logo href={null} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: durations.base, ease: easeOutExpo, delay: 0.08 }}
          className="flex items-center gap-2"
        >
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Войти
            </Button>
          </Link>
          <Button size="sm" onClick={() => navigate('/register')} iconRight={<ArrowRight />}>
            Начать
          </Button>
        </motion.div>
      </header>

      {/* ---------- ПЕРВЫЙ ЭКРАН ---------- */}
      <section className="page-x mx-auto grid min-h-dvh max-w-7xl grid-cols-1 items-center gap-14 pb-20 pt-[calc(var(--header-h)+4.5rem)] lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:pt-[var(--header-h)]">
        <div className="relative z-10">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: durations.base, ease: easeOutExpo, delay: 0.1 }}
            className="text-eyebrow uppercase text-accent-300"
          >
            Fattakhov HR Agency · для студентов
          </motion.p>

          <SplitText
            text="Работа, которая помещается между парами"
            className="mt-7 max-w-[15ch] text-display-lg"
            wordClassName="text-gradient"
            delay={0.22}
          />

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: durations.slow, ease: easeOutExpo, delay: 0.55 }}
            className="mt-7 max-w-[46ch] text-[16.5px] leading-relaxed text-paper-dim"
          >
            Смахните вправо — отклик уходит работодателю в ту же секунду. Никаких сопроводительных
            писем и ожидания на неделю: только проверенные компании и график под вашу учёбу.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: durations.slow, ease: easeOutExpo, delay: 0.68 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Button size="lg" onClick={() => navigate('/register')} iconRight={<ArrowRight />}>
              Создать профиль
            </Button>
            <Link href="/login">
              <Button variant="outline" size="lg">
                У меня уже есть аккаунт
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.slow, delay: 0.9 }}
            className="mt-8 flex items-center gap-2 text-[12.5px] text-paper-faint"
          >
            <ShieldCheck className="size-3.5 shrink-0 text-accent-400" aria-hidden />
            Персональные данные шифруются и передаются только тем компаниям, которым вы сами
            откликнулись
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1, ease: easeOutExpo, delay: 0.35 }}
          className="relative"
        >
          <DemoDeck vacancies={vacancies} />
        </motion.div>
      </section>

      {/* ---------- ЦИФРЫ ---------- */}
      <section className="page-x mx-auto max-w-7xl py-16">
        <Stagger className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-[var(--hairline)] bg-[var(--hairline)] md:grid-cols-4">
          <Metric value={860} suffix="+" label="студентов в базе" />
          <Metric value={48} label="компаний-партнёров" />
          <Metric value={3} label="дня до первого ответа" />
          <Metric value={71} suffix="%" label="доходят до собеседования" />
        </Stagger>
      </section>

      {/* ---------- КАК ЭТО РАБОТАЕТ ---------- */}
      <section className="page-x mx-auto max-w-7xl py-16 sm:py-24">
        <SplitTextInView
          text="Три шага вместо трёх недель"
          className="max-w-[14ch] text-display-lg"
          wordClassName="text-gradient"
        />

        <Stagger className="mt-14 grid gap-4 md:grid-cols-3" each={0.09}>
          {STEPS.map((step, index) => (
            <Reveal key={step.title} variants={fadeUp}>
              <article className="glass group h-full rounded-3xl p-7 transition-colors duration-500 hover:border-paper/20">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-2xl border border-accent-500/30 bg-accent-500/12 text-accent-200">
                    {step.icon}
                  </span>
                  <span className="text-[42px] font-semibold leading-none tracking-tight text-paper/[0.07] transition-colors duration-500 group-hover:text-paper/[0.13]">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-6 text-[19px] font-semibold tracking-[-0.02em] text-paper">
                  {step.title}
                </h3>
                <p className="mt-2.5 text-[14.5px] leading-relaxed text-paper-dim">{step.body}</p>
              </article>
            </Reveal>
          ))}
        </Stagger>
      </section>

      {/* ---------- КОМПАНИИ ---------- */}
      <section className="overflow-hidden py-10">
        <p className="page-x mx-auto max-w-7xl text-eyebrow uppercase text-paper-faint">
          Кто уже ищет студентов
        </p>
        <div className="relative mt-6">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-ink to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-ink to-transparent" />
          <motion.div
            className="flex w-max gap-3"
            animate={{ x: ['0%', '-50%'] }}
            transition={{ duration: 34, ease: 'linear', repeat: Infinity }}
          >
            {[...companies, ...companies].map((company, index) => (
              <span
                key={`${company}-${index}`}
                className="whitespace-nowrap rounded-full border border-[var(--hairline)] bg-graphite-900/40 px-5 py-2.5 text-[14px] text-paper/70"
              >
                {company}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ---------- ЗАКЛЮЧИТЕЛЬНЫЙ ПРИЗЫВ ---------- */}
      <section className="page-x mx-auto max-w-7xl py-20 sm:py-28">
        <div className="glass relative overflow-hidden rounded-4xl px-7 py-16 text-center sm:px-16 sm:py-24">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-64 w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/25 blur-[100px]"
          />
          <CubeMark className="mx-auto h-14 w-14 text-paper/70" />
          <SplitTextInView
            text="Первая подборка ждёт вас"
            className="mx-auto mt-8 max-w-[16ch] text-display-md text-paper"
            as="h2"
          />
          <p className="mx-auto mt-5 max-w-[48ch] text-[15.5px] leading-relaxed text-paper-dim">
            Заполните профиль — и лента соберётся под ваш график, город и навыки. Отказаться от
            вакансии можно одним движением, вернуть — тоже.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={() => navigate('/register')} iconRight={<ArrowRight />}>
              Создать профиль
            </Button>
            <Link href="/employer">
              <Button variant="ghost" size="lg">
                Я работодатель
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="page-x mx-auto max-w-7xl border-t border-[var(--hairline)] py-10">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <Logo href={null} />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-paper-faint">
            {/* Сайт агентства — отдельное приложение, поэтому <a>, а не Link */}
            {agencyUrl && (
              <a href={agencyUrl} className="transition-colors hover:text-paper">
                Сайт агентства
              </a>
            )}
            <Link href="/login" className="transition-colors hover:text-paper">
              Вход для студентов
            </Link>
            <Link href="/employer" className="transition-colors hover:text-paper">
              Кабинет работодателя
            </Link>
            <Link href="/institutions/rating" className="transition-colors hover:text-paper">
              Рейтинг вузов
            </Link>
            <Link href="/legal/terms" className="transition-colors hover:text-paper">
              Соглашение
            </Link>
            <Link href="/legal/privacy" className="transition-colors hover:text-paper">
              Политика ПДн
            </Link>
            <Link href="/help" className="transition-colors hover:text-paper">
              Помощь
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Tag>ПДн шифруются</Tag>
            <span className="text-[12.5px] text-paper-faint">© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Metric({ value, label, suffix }: { value: number; label: string; suffix?: string }) {
  return (
    <Reveal variants={fadeUp}>
      <div className="h-full bg-ink px-6 py-8 sm:px-8 sm:py-10">
        <p className="text-[clamp(2rem,4vw,2.75rem)] font-semibold leading-none tracking-[-0.04em] text-paper">
          <CountUp to={value} suffix={suffix} />
        </p>
        <p className="mt-3 text-[13px] leading-snug text-paper-faint">{label}</p>
      </div>
    </Reveal>
  );
}
