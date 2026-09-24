import { CircleUserRound, MessageCircle } from 'lucide-react';
import type { NavItem } from '@/components/layout/NavTabs';

/**
 * Навигация кабинета работодателя — в одном месте.
 *
 * Раньше массив вкладок повторялся на каждой странице кабинета, и новая
 * вкладка появлялась там, куда её не забыли вписать. Три страницы — уже
 * достаточно, чтобы одна отстала.
 *
 * «Компания» и «Сообщения» — иконками, без подписи: ряд из пяти текстовых
 * вкладок не помещался бы на телефоне в одну строку без переноса.
 */
export function employerNav(applications: number, unread: number): NavItem[] {
  return [
    { href: '/employer', label: 'Отклики', badge: applications, exact: true },
    { href: '/employer/vacancies', label: 'Вакансии' },
    { href: '/employer/candidates', label: 'Кандидаты' },
    {
      href: '/employer/messages',
      label: 'Сообщения',
      badge: unread,
      icon: <MessageCircle className="size-[18px]" aria-hidden />,
      hideLabel: true,
    },
    {
      href: '/employer/company',
      label: 'Компания',
      icon: <CircleUserRound className="size-[18px]" aria-hidden />,
      hideLabel: true,
    },
  ];
}
