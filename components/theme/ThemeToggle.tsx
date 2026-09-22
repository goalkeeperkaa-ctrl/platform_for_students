'use client';

import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useTheme } from './ThemeProvider';
import { cn } from '@/lib/utils';

const emptySubscribe = () => () => {};

/** До монтирования на клиенте resolvedTheme неизвестен серверу. */
function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/**
 * Один переключатель на всё приложение — плавающая кнопка поверх любой
 * страницы (см. app/layout.tsx), а не часть шапки кабинета: экран входа,
 * регистрации и справки шапки не имеют вовсе, а тему выбирать нужно
 * и там. На телефоне — тот же угол, с отступом под безопасную зону.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <button
      type="button"
      aria-label="Переключить тему"
      title="Переключить тему"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className={cn(
        'fixed z-[70] grid size-11 place-items-center rounded-full border border-[var(--hairline)] bg-graphite-900/60 text-paper/70 shadow-lift backdrop-blur-glass transition-colors hover:border-[var(--hairline-strong)] hover:text-paper',
        'bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))]',
        className,
      )}
    >
      {mounted && (resolvedTheme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />)}
    </button>
  );
}
