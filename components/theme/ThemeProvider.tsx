'use client';

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from 'react';

/**
 * Минимальная замена next-themes — тот же приём, что в CRM
 * (components/shell/theme-provider.tsx), портирован сюда без изменений
 * в логике: анти-мерцающий скрипт вписан прямо в разметку app/layout.tsx
 * (см. NO_FLASH_SCRIPT там же), а не рождён клиентским компонентом —
 * React 19 иначе безусловно ругается на исполняемый <script> при
 * реконсиляции. Здесь — только реактивная часть.
 */

export type Theme = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

/** Должен совпадать с ключом в анти-мерцающем скрипте в app/layout.tsx. */
const STORAGE_KEY = 'theme';

function prefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(theme: Theme): Resolved {
  return theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme;
}

function applyToDocument(resolved: Resolved): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}

function readStoredTheme(): Theme {
  try {
    return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system';
  } catch {
    return 'system';
  }
}

function getThemeSnapshot(): Theme {
  return readStoredTheme();
}

function getThemeServerSnapshot(): Theme {
  return 'system';
}

function getResolvedSnapshot(): Resolved {
  return resolve(readStoredTheme());
}

/** Тёмная — единственная тема, которая существовала до переключателя. */
function getResolvedServerSnapshot(): Resolved {
  return 'dark';
}

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  window.addEventListener('storage', onChange);
  mql.addEventListener('change', onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    mql.removeEventListener('change', onChange);
  };
}

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: Resolved;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getThemeServerSnapshot);
  const resolvedTheme = useSyncExternalStore(subscribe, getResolvedSnapshot, getResolvedServerSnapshot);

  useEffect(() => {
    applyToDocument(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Приватный режим — тема просто не переживёт перезагрузку
    }
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
  }, []);

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme вызван вне ThemeProvider');
  return ctx;
}
