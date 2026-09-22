'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeftRight, BookOpen, Compass, HelpCircle, LogOut } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { TourController } from '@/components/onboarding/Tour';
import { springSnappy } from '@/lib/motion';
import { TOUR_START_EVENT } from '@/lib/tour';
import { cn } from '@/lib/utils';

/**
 * Карточка пользователя, помощь и выход.
 *
 * Выход виден всегда, а не раскрывается по наведению: на телефоне
 * наведения нет вовсе, а прятать единственное действие за меню из
 * одного пункта — лишний слой ради лишнего слоя.
 *
 * «?» открывает два пункта: повторить инструкцию и страницу помощи. Здесь
 * же живёт сама инструкция — шапка есть на каждом экране кабинета.
 *
 * Карточка ведёт в профиль, только если профиль есть: `href` передаёт
 * лишь кабинет студента. У работодателя и администратора своей анкеты
 * нет, и кликабельное имя вело бы в никуда.
 */
export function UserMenu({
  name,
  subtitle,
  href,
  backToCrmUrl,
}: {
  name: string;
  subtitle?: string;
  href?: string;
  /** Пришёл из CRM (сотрудник агентства или представитель клиента) — вернуться туда же. */
  backToCrmUrl?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!helpOpen) return;
    function onDown(event: MouseEvent) {
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) setHelpOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setHelpOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [helpOpen]);

  async function logout() {
    setPending(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.push('/');
    router.refresh();
  }

  const cardClass =
    'flex items-center gap-2.5 rounded-full border border-[var(--hairline)] bg-graphite-900/50 py-1 pl-1 pr-3.5 backdrop-blur';
  const card = (
    <>
      <Avatar name={name} size={30} />
      <span className="hidden min-w-0 sm:block">
        <span className="block max-w-[11rem] truncate text-[13px] font-medium leading-tight text-paper">
          {name}
        </span>
        {subtitle && (
          <span className="block max-w-[11rem] truncate text-[11px] leading-tight text-paper-faint">
            {subtitle}
          </span>
        )}
      </span>
    </>
  );

  const roundButton =
    'grid size-10 shrink-0 place-items-center rounded-full border border-[var(--hairline)] bg-graphite-900/50 text-paper/55 backdrop-blur transition-colors';

  return (
    <div className="flex items-center gap-1.5">
      {href ? (
        <Link
          href={href}
          title="Профиль"
          data-tour="profile"
          className={cn(cardClass, 'transition-colors hover:border-[var(--hairline-strong)] hover:bg-graphite-800/60')}
        >
          {card}
        </Link>
      ) : (
        <div className={cardClass}>{card}</div>
      )}

      {backToCrmUrl && (
        <motion.a
          href={backToCrmUrl}
          whileHover={{ y: -1.5 }}
          whileTap={{ scale: 0.92 }}
          transition={springSnappy}
          aria-label="Открыть CRM"
          title="Открыть CRM"
          className={cn(roundButton, 'hover:border-paper/30 hover:text-paper')}
        >
          <ArrowLeftRight className="size-4" />
        </motion.a>
      )}

      <div ref={helpRef} className="relative">
        <motion.button
          type="button"
          onClick={() => setHelpOpen((value) => !value)}
          whileHover={{ y: -1.5 }}
          whileTap={{ scale: 0.92 }}
          transition={springSnappy}
          aria-label="Помощь"
          aria-expanded={helpOpen}
          title="Помощь"
          data-tour="help"
          className={cn(roundButton, 'hover:border-paper/30 hover:text-paper')}
        >
          <HelpCircle className="size-4" />
        </motion.button>
        {helpOpen && (
          <div className="absolute right-0 top-12 z-[60] w-60 rounded-2xl border border-[var(--hairline)] bg-graphite-900 p-1.5 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setHelpOpen(false);
                window.dispatchEvent(new Event(TOUR_START_EVENT));
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] text-paper transition-colors hover:bg-paper/[0.06]"
            >
              <Compass className="size-4 shrink-0 text-accent-300" aria-hidden />
              Как пользоваться
            </button>
            <Link
              href="/help"
              onClick={() => setHelpOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] text-paper transition-colors hover:bg-paper/[0.06]"
            >
              <BookOpen className="size-4 shrink-0 text-accent-300" aria-hidden />
              Частые вопросы
            </Link>
          </div>
        )}
      </div>

      <motion.button
        type="button"
        onClick={logout}
        disabled={pending}
        whileHover={{ y: -1.5 }}
        whileTap={{ scale: 0.92 }}
        transition={springSnappy}
        aria-label="Выйти из аккаунта"
        title="Выйти"
        className={cn(roundButton, 'hover:border-danger/40 hover:text-danger disabled:opacity-50')}
      >
        <LogOut className="size-4" />
      </motion.button>

      <TourController />
    </div>
  );
}
