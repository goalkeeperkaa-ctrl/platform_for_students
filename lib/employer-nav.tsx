import { Briefcase, Inbox, MessageCircle, Users } from 'lucide-react';
import type { NavItem } from '@/components/layout/NavTabs';

/**
 * Навигация кабинета работодателя — в одном месте.
 *
 * Раньше массив вкладок повторялся на каждой странице кабинета, и новая
 * вкладка появлялась там, куда её не забыли вписать. Три страницы — уже
 * достаточно, чтобы одна отстала.
 *
 * Все вкладки — иконками, без подписи. Разной длины текст «Отклики» /
 * «Кандидаты» заставлял подложку активной вкладки менять ширину при
 * переезде между ними — с иконками одинакового размера она просто
 * скользит, не дёргаясь.
 *
 * «Компания» здесь больше нет: в неё ведёт аватар в шапке (см. UserMenu),
 * а вкладки оставлены только тем разделам, у которых нет другого входа.
 */
export function employerNav(applications: number, unread: number): NavItem[] {
  return [
    {
      href: '/employer',
      label: 'Отклики',
      badge: applications,
      exact: true,
      icon: <Inbox className="size-[18px]" aria-hidden />,
      hideLabel: true,
    },
    {
      href: '/employer/vacancies',
      label: 'Вакансии',
      icon: <Briefcase className="size-[18px]" aria-hidden />,
      hideLabel: true,
    },
    {
      href: '/employer/candidates',
      label: 'Кандидаты',
      icon: <Users className="size-[18px]" aria-hidden />,
      hideLabel: true,
    },
    {
      href: '/employer/messages',
      label: 'Сообщения',
      badge: unread,
      icon: <MessageCircle className="size-[18px]" aria-hidden />,
      hideLabel: true,
    },
  ];
}
