/**
 * Разделы панели HR для сотрудников агентства, вошедших из CRM.
 *
 * Доступы выдаёт владелец в CRM («Сотрудники»); сюда они приходят в билете
 * входа и живут в сессии. HR-менеджер, заведённый здесь командой
 * admin:create, списка не имеет и не ограничен — это учётка на крайний
 * случай, когда CRM недоступна.
 *
 * Модуль без Node-зависимостей: его читает и middleware на edge.
 */

export const STAFF_PERMISSIONS = ['moderation', 'students', 'pilot'] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

/**
 * Сессия сотрудника из CRM живёт рабочий день. Отключённый в CRM нового
 * билета не получит, а открытая сессия закроется не позже этого срока.
 */
export const STAFF_SESSION_SECONDS = 8 * 60 * 60;

/** Разделы из произвольного значения; не массив — списка нет вовсе. */
export function readStaffPermissions(value: unknown): StaffPermission[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return STAFF_PERMISSIONS.filter((permission) => value.includes(permission));
}

/** Открыт ли раздел: без списка — всё (учётка admin:create), со списком — только выданное. */
export function staffCan(
  session: { role: string; permissions?: readonly StaffPermission[] } | null,
  permission: StaffPermission,
): boolean {
  if (!session || session.role !== 'ADMIN') return false;
  return session.permissions === undefined || session.permissions.includes(permission);
}

/** Куда вести после входа из CRM: к первому выданному разделу, а не на пустую для него панель. */
export function staffHome(permissions: readonly StaffPermission[]): string {
  if (permissions.includes('moderation')) return '/admin/moderation';
  if (permissions.includes('students')) return '/admin/students';
  if (permissions.includes('pilot')) return '/admin/pilot';
  return '/admin';
}
