'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
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
  const liveUnread = useLiveMessagesBadge(items);

  return (
    <nav className={cn('flex items-center gap-0.5 rounded-full border border-[var(--hairline)] bg-graphite-900/50 p-1 backdrop-blur-glass', className)}>
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        // Значок сообщений досчитывается вживую (см. useLiveMessagesBadge):
        // иначе новый ответ работодателя был виден только после перехода
        // на другую страницу — сервер считал его один раз при заходе.
        const badge = item.href.endsWith('/messages') && liveUnread !== null ? liveUnread : item.badge;
        const hasBadge = badge !== undefined && badge > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            data-tour={'nav:' + item.href}
            aria-current={active ? 'page' : undefined}
            aria-label={item.hideLabel ? item.label : undefined}
            title={item.hideLabel ? item.label : undefined}
            className={cn(
              'relative flex items-center rounded-full text-[13px] font-medium transition-colors duration-300',
              // Иконка без подписи — фиксированный квадрат: у всех вкладок
              // одинаковая ширина, поэтому подложка активной вкладки просто
              // скользит, а не меняет размер, переезжая между ними
              item.hideLabel ? 'size-10 justify-center' : 'gap-1.5 px-3.5 py-2',
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
            {hasBadge && item.hideLabel && (
              // Значок точкой поверх иконки — не в общем потоке: иначе он
              // и растягивал бы вкладку ровно так же, как раньше текст
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-accent-500 px-1 text-center text-[9.5px] font-semibold leading-[16px] text-ink"
              >
                {badge}
              </span>
            )}
            {hasBadge && !item.hideLabel && (
              <span
                className={cn(
                  'relative min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-[10.5px] leading-none tabular-nums',
                  active ? 'bg-accent-500/35 text-accent-100' : 'bg-paper/[0.08] text-paper/60',
                )}
              >
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Непрочитанные сообщения — вживую, а не один раз при заходе.
 *
 * Раньше значок считал сервер при рендере страницы и больше не трогал
 * его: пришло сообщение, пока человек сидит в «Ленте», — значок так и
 * висел со старым числом, пока не откроешь другую страницу. Тот же
 * поток, что двигает список диалогов на экране переписки (см.
 * useLiveThreads) — здесь просто досчитывает сумму по всем диалогам.
 *
 * null, пока не пришло первое обновление, — тогда рендер берёт число
 * с сервера (item.badge), а не мигает нулём до первого ответа.
 */
function useLiveMessagesBadge(items: NavItem[]): number | null {
  const hasMessagesTab = items.some((item) => item.href.endsWith('/messages'));
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => {
    if (!hasMessagesTab) return;
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch('/api/messages');
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { threads: { unread: number }[] };
        if (!cancelled) setUnread(data.threads.reduce((sum, t) => sum + t.unread, 0));
      } catch {
        /* сеть моргнула — следующее событие сверит заново */
      }
    }

    void refresh();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMessagesTab]);

  useLiveMessagesEvents(hasMessagesTab, () => {
    fetch('/api/messages')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { threads: { unread: number }[] } | null) => {
        if (data) setUnread(data.threads.reduce((sum, t) => sum + t.unread, 0));
      })
      .catch(() => {});
  });

  return unread;
}

/** Тонкая обёртка над useLiveThreads: не подключаемся, если нет вкладки сообщений. */
function useLiveMessagesEvents(enabled: boolean, onEvent: () => void): void {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    let source: EventSource | null = null;
    try {
      source = new EventSource('/api/messages/stream');
      source.onmessage = () => handler.current();
      source.onerror = () => {};
    } catch {
      /* браузер без SSE — обновится по visibilitychange/интервалу ниже */
    }

    const reconcile = setInterval(() => handler.current(), 20_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') handler.current();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      source?.close();
      clearInterval(reconcile);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}
