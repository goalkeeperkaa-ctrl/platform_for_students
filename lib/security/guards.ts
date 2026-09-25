import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getStore } from '@/lib/db';
import { hasCompanyProfile } from '@/lib/company';
import type { Role, SessionUser } from '@/lib/types';
import { SESSION_COOKIE, verifySession } from './session';
import { staffCan, type StaffPermission } from '@/lib/staff-permissions';
import { clientIp } from './rate-limit';

/** Текущая сессия из httpOnly-куки. null — гость. */
export async function getSession(): Promise<SessionUser | null> {
  return verifySession(cookies().get(SESSION_COOKIE)?.value);
}

/**
 * Сессия с нужной ролью — или null.
 *
 * Middleware уже отсекает чужие разделы по URL, но проверка обязана
 * повторяться здесь: middleware защищает страницы, а не данные, и один
 * забытый matcher открыл бы API целиком.
 */
export async function getSessionWithRole(...roles: Role[]): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session || !roles.includes(session.role)) return null;
  return session;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const session = await getSessionWithRole(...roles);
  if (!session) throw new HttpError(401, 'Требуется вход в систему', 'UNAUTHORIZED');
  return session;
}

/**
 * Сотрудник в API панели HR. Без permission — любой, кто вошёл в панель;
 * с ним — только тот, кому раздел выдан в CRM. Отключённая учётка не проходит,
 * даже пока жива её кука.
 */
export async function requireStaff(permission?: StaffPermission): Promise<SessionUser> {
  const session = await requireRole('ADMIN');
  const store = await getStore();
  const account = await store.accounts.findById(session.accountId);
  if (!account || !account.isActive) throw new HttpError(401, 'Требуется вход в систему', 'UNAUTHORIZED');
  if (permission && !staffCan(session, permission)) {
    throw new HttpError(403, 'Этот раздел вам не выдан — доступы выдаёт владелец в CRM', 'FORBIDDEN');
  }
  return session;
}

/** Профиль студента текущей сессии. */
export async function requireStudent() {
  const session = await requireRole('STUDENT');
  const store = await getStore();
  const student = await store.students.findByAccountId(session.accountId);
  if (!student) throw new HttpError(403, 'Профиль студента не найден', 'NO_PROFILE');
  return { session, student, store };
}

/** Профиль работодателя текущей сессии. */
export async function requireEmployer() {
  const session = await requireRole('EMPLOYER');
  const store = await getStore();
  const employer = await store.employers.findByAccountId(session.accountId);
  if (!employer) throw new HttpError(403, 'Кабинет работодателя не найден', 'NO_PROFILE');
  return { session, employer, store };
}

/**
 * Действие, для которого нужна подтверждённая почта, — отправка вакансии
 * на проверку. Смотреть кабинет и готовить черновики можно и без неё.
 */
export async function assertEmailVerified(accountId: string): Promise<void> {
  const store = await getStore();
  const account = await store.accounts.findById(accountId);
  if (!account?.emailVerifiedAt) {
    throw new HttpError(
      403,
      'Сначала подтвердите почту — код пришёл в письме. Отправить его снова можно вверху страницы.',
      'EMAIL_NOT_VERIFIED',
    );
  }
}

/**
 * Отправка вакансии на проверку требует названия компании, контакта и
 * ИНН — без них HR-менеджеру нечего сверять с госреестром. Регистрация
 * их больше не требует, поэтому это отдельная проверка перед отправкой,
 * а не условие входа в кабинет.
 */
export function assertCompanyProfileComplete(employer: {
  companyName: string;
  contactName: string;
  inn: string | null;
  crmClientId: string | null;
}): void {
  if (!hasCompanyProfile(employer)) {
    throw new HttpError(
      403,
      'Сначала укажите название компании, контакт и ИНН в разделе «Компания» — по ним агентство проверяет вакансию.',
      'COMPANY_PROFILE_INCOMPLETE',
    );
  }
}

/**
 * Гварды для серверных компонентов.
 *
 * В API-роуте отсутствие профиля — честный 403 в JSON. На странице то же
 * исключение превратилось бы в 500 вместо экрана входа, поэтому здесь мы
 * не бросаем, а уводим на выход: сессия, ссылающаяся на несуществующий
 * аккаунт, недействительна, и куку надо снять. Иначе человек застревает
 * между /feed и /login — middleware пускает его по валидной подписи,
 * а страница падает на отсутствующем профиле.
 */
export async function requireStudentPage(next = '/feed') {
  const session = await getSessionWithRole('STUDENT');
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  const store = await getStore();
  const student = await store.students.findByAccountId(session.accountId);
  if (!student) redirect(`/logout?reason=stale&next=${encodeURIComponent(next)}`);
  return { session, student, store };
}

export async function requireEmployerPage(next = '/employer') {
  const session = await getSessionWithRole('EMPLOYER');
  if (!session) redirect(`/login?role=employer&next=${encodeURIComponent(next)}`);
  const store = await getStore();
  const employer = await store.employers.findByAccountId(session.accountId);
  if (!employer) redirect(`/logout?reason=stale&next=${encodeURIComponent(next)}`);
  return { session, employer, store };
}

export async function requireAdminPage(next = '/admin', permission?: StaffPermission) {
  const session = await getSessionWithRole('ADMIN');
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  const store = await getStore();
  const account = await store.accounts.findById(session.accountId);
  if (!account || !account.isActive) redirect(`/logout?reason=stale&next=${encodeURIComponent(next)}`);
  // Невыданный раздел — на панель, а не ошибкой: вкладки его и так не показывают
  if (permission && !staffCan(session, permission)) redirect('/admin');
  return session;
}

export interface AuditInput {
  action: string;
  entity?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown> | null;
}

/**
 * Запись в журнал аудита.
 *
 * Никогда не бросает: провал логирования не должен отменять действие,
 * которое пользователь уже совершил. Но и молчать нельзя — ошибка уходит
 * в консоль сервера.
 */
export async function audit(
  session: SessionUser | null,
  input: AuditInput,
  requestHeaders?: Headers,
): Promise<void> {
  try {
    const store = await getStore();
    const h = requestHeaders ?? headers();
    await store.audit.log({
      accountId: session?.accountId ?? null,
      actorLabel: session ? `${session.role}:${session.name || session.accountId}` : 'ANONYMOUS',
      action: input.action,
      entity: input.entity ?? null,
      entityId: input.entityId ?? null,
      ip: clientIp(h),
      userAgent: h.get('user-agent'),
      meta: input.meta ?? null,
    });
  } catch (err) {
    console.error('[audit] не удалось записать событие:', err);
  }
}

/**
 * Запись в журнал для решений, принятых из CRM через служебный API —
 * там нет своей сессии здесь, только тот, кто нажал кнопку в CRM
 * (передаётся телом запроса). accountId остаётся пустым: подставлять
 * туда служебный или чужой accountId значило бы приписать действие не
 * тому человеку, а настоящего accountId в этой базе для него нет.
 */
export async function auditService(actorLabel: string, input: AuditInput, requestHeaders?: Headers): Promise<void> {
  try {
    const store = await getStore();
    const h = requestHeaders ?? headers();
    await store.audit.log({
      accountId: null,
      actorLabel: `CRM:${actorLabel}`,
      action: input.action,
      entity: input.entity ?? null,
      entityId: input.entityId ?? null,
      ip: clientIp(h),
      userAgent: h.get('user-agent'),
      meta: input.meta ?? null,
    });
  } catch (err) {
    console.error('[audit] не удалось записать событие:', err);
  }
}

/**
 * Защита от межсайтовой отправки форм.
 *
 * Куки помечены SameSite=Lax, поэтому браузер и так не приложит их к
 * кросс-сайтовому POST. Сверка Origin — второй рубеж на случай клиента,
 * который SameSite не соблюдает.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin) return; // не браузерный запрос: same-origin fetch может не слать Origin
  const host = request.headers.get('host');
  try {
    if (new URL(origin).host !== host) {
      throw new HttpError(403, 'Запрос с чужого источника отклонён', 'BAD_ORIGIN');
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(403, 'Некорректный заголовок Origin', 'BAD_ORIGIN');
  }
}
