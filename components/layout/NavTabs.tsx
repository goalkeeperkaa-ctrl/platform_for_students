'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { springSoft } from '@/lib/motion';

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
  /** Подсвечивать только на точном совпадении. Нужно корневому разделу,
   *  чей путь является префиксом всех остальных. */
  exact?: boolean;
  /** Иконка вместо текста — label остаётся для aria-label и подсказки при наведении. */
  icon?: React.ReactNode;
  /** Показать только иконку, без видимого текста рядом. */
  hideLabel?: boolean;
}

/**
 * Вкладки разделов.
 *
 * Подложка активной вкладки — один общий элемент с layoutId: она
 * переезжает между вкладками, а не гаснет и зажигается заново. Именно
 * переезд подсказывает, что разделы лежат в одном ряду, а не заменяют
 * друг друга.
 */
export function NavTabs({ items, className }: { items: NavItem[]; className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn('flex items-center gap-0.5 rounded-full border border-[var(--hairline)] bg-graphite-900/50 p-1 backdrop-blur-glass', className)}>
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            data-tour={'nav:' + item.href}
            aria-current={active ? 'page' : undefined}
            aria-label={item.hideLabel ? item.label : undefined}
            title={item.hideLabel ? item.label : undefined}
            className={cn(
              'relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors duration-300',
              item.hideLabel && 'px-3',
              active ? 'text-paper' : 'text-paper/55 hover:text-paper/85',
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                transition={springSoft}
                className="absolute inset-0 rounded-full border border-[var(--hairline-strong)] bg-paper/[0.09]"
              />
            )}
            {item.icon && <span className="relative flex shrink-0 items-center">{item.icon}</span>}
            <span className={cn('relative whitespace-nowrap', item.hideLabel && 'sr-only')}>{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span
                className={cn(
                  'relative min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-[10.5px] leading-none tabular-nums',
                  active ? 'bg-accent-500/35 text-accent-100' : 'bg-paper/[0.08] text-paper/60',
                )}
              >
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
