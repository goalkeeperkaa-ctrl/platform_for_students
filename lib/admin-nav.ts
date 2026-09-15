import type { NavItem } from '@/components/layout/NavTabs';

/**
 * Навигация панели HR-менеджера. Счётчики — то, что ждёт решения: новые
 * компании и вакансии на «Модерации», справки об обучении на «Студентах».
 * Без них заявка висела бы в очереди, пока кто-нибудь случайно не заглянет.
 */
export function adminNav(pendingModeration: number, pendingStudy = 0): NavItem[] {
  return [
    { href: '/admin', label: 'Панель', exact: true },
    { href: '/admin/pilot', label: 'Пилот' },
    { href: '/admin/students', label: 'Студенты', badge: pendingStudy },
    { href: '/admin/moderation', label: 'Модерация', badge: pendingModeration },
  ];
}
