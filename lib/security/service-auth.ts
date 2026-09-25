import 'server-only';
import { safeEqual } from '@/lib/security/crypto';
import { HttpError } from '@/lib/security/guards';

/**
 * Служебный вход сервера в сервер — для CRM, а не для браузера.
 *
 * Отдельный секрет от STUDENTS_SSO_SECRET: тот подписывает короткоживущие
 * билеты входа человека через редирект, этот — просто пароль между двумя
 * бэкендами по HTTPS, без пользователя и без сессии. Смешивать нельзя:
 * компрометация одного не должна открывать другой канал.
 */

/** Секрет из окружения; null — служебный вход не настроен. */
export function crmServiceSecret(): string | null {
  const raw = process.env.CRM_SERVICE_SECRET?.trim();
  return raw && raw.length >= 32 ? raw : null;
}

/** Бросает 401/503 — используется в начале служебных роутов /api/service/*. */
export function assertServiceAuth(request: Request): void {
  if (!hasServiceAuth(request)) {
    throw new HttpError(
      crmServiceSecret() ? 401 : 503,
      crmServiceSecret() ? 'Неверный служебный токен' : 'Служебный вход не настроен: нужен CRM_SERVICE_SECRET',
      crmServiceSecret() ? 'UNAUTHORIZED' : 'SERVICE_NOT_CONFIGURED',
    );
  }
}

/**
 * Не бросает — для мест, где служебный вызов лишь один из способов
 * пройти проверку (см. /api/files: тот же файл читает и сессия
 * сотрудника, и теперь CRM своим секретом).
 */
export function hasServiceAuth(request: Request): boolean {
  const secret = crmServiceSecret();
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return Boolean(token) && safeEqual(token, secret);
}
