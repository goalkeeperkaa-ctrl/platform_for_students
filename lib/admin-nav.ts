import type { NavItem } from '@/components/layout/NavTabs';
import type { StaffPermission } from '@/lib/staff-permissions';

/**
 * Навигация панели HR-менеджера. Счётчики — то, что ждёт решения: новые
 * компании и вакансии на «Модерации», справки об обучении на «Студентах».
 * Без них заявка висела бы в очереди, пока кто-нибудь случайно не заглянет.
 *
 * Сотрудник, вошедший из CRM, видит только выданные ему разделы: вкладка,
 * которая открывается отказом, — это не навигация, а приглашение ошибиться.
 */
export function adminNav(
  pendingModeration: number,
  pendingStudy = 0,
  permissions?: readonly StaffPermission[],
): NavItem[] {
  const can = (permission: StaffPermission) => permissions === undefined || permissions.includes(permission);
  const items: NavItem[] = [{ href: '/admin', label: 'Панель', exact: true }];
  if (can('pilot')) items.push({ href: '/admin/pilot', label: 'Пилот' });
  if (can('students')) items.push({ href: '/admin/students', label: 'Студенты', badge: pendingStudy });
  if (can('moderation')) items.push({ href: '/admin/moderation', label: 'Модерация', badge: pendingModeration });
  return items;
}
