import type { NavItem } from '@/components/layout/NavTabs';

/**
 * Навигация панели HR-менеджера. Счётчик на «Модерации» — то, что ждёт
 * решения: без него новая компания висела бы в очереди, пока кто-нибудь
 * случайно не заглянет.
 */
export function adminNav(pendingModeration: number): NavItem[] {
  return [
    { href: '/admin', label: 'Панель', exact: true },
    { href: '/admin/students', label: 'Студенты' },
    { href: '/admin/moderation', label: 'Модерация', badge: pendingModeration },
  ];
}
