'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { springSnappy } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Карточка пользователя и выход.
 *
 * Выход виден всегда, а не раскрывается по наведению: на телефоне
 * наведения нет вовсе, а прятать единственное действие за меню из
 * одного пункта — лишний слой ради лишнего слоя.
 *
 * Карточка ведёт в профиль, только если профиль есть: `href` передаёт
 * лишь кабинет студента. У работодателя и администратора своей анкеты
 * нет, и кликабельное имя вело бы в никуда.
 */
export function UserMenu({ name, subtitle, href }: { name: string; subtitle?: string; href?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

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

  return (
    <div className="flex items-center gap-1.5">
      {href ? (
        <Link
          href={href}
          title="Профиль"
          className={cn(cardClass, 'transition-colors hover:border-[var(--hairline-strong)] hover:bg-graphite-800/60')}
        >
          {card}
        </Link>
      ) : (
        <div className={cardClass}>{card}</div>
      )}

      <motion.button
        type="button"
        onClick={logout}
        disabled={pending}
        whileHover={{ y: -1.5 }}
        whileTap={{ scale: 0.92 }}
        transition={springSnappy}
        aria-label="Выйти из аккаунта"
        title="Выйти"
        className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--hairline)] bg-graphite-900/50 text-paper/55 backdrop-blur transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
      >
        <LogOut className="size-4" />
      </motion.button>
    </div>
  );
}
