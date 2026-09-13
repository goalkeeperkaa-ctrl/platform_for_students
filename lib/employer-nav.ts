import type { NavItem } from '@/components/layout/NavTabs';

/**
 * Навигация кабинета работодателя — в одном месте.
 *
 * Раньше массив вкладок повторялся на каждой странице кабинета, и новая
 * вкладка появлялась там, куда её не забыли вписать. Три страницы — уже
 * достаточно, чтобы одна отстала.
 */
export function employerNav(applications: number, unread: number): NavItem[] {
  return [
    { href: '/employer', label: 'Отклики', badge: applications, exact: true },
    { href: '/employer/vacancies', label: 'Вакансии' },
    { href: '/employer/messages', label: 'Сообщения', badge: unread },
    { href: '/employer/company', label: 'Компания' },
  ];
}
