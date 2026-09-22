import crypto from 'node:crypto';
import { readStaffPermissions, type StaffPermission } from '@/lib/staff-permissions';

/**
 * Билет входа из CRM.
 *
 * CRM подписывает его общим секретом (STUDENTS_SSO_SECRET) — формат и
 * выпуск в lib/students-sso.ts сайта агентства: base64url(JSON).base64url(HMAC-SHA256).
 * Здесь только проверка; погасить билет, чтобы по нему не вошли второй раз,
 * — дело маршрута входа.
 */

export interface StaffTicket {
  kind: 'staff';
  /** Сотрудник в CRM — для журнала */
  sub: string;
  email: string;
  name: string;
  position: string | null;
  permissions: StaffPermission[];
  jti: string;
  exp: number;
}

/**
 * Билет клиента CRM — вход в кабинет компании, привязанной к этому
 * клиенту (Employer.crmClientId), без пароля на студенческой платформе.
 */
export interface ClientTicket {
  kind: 'client';
  /** Пользователь клиента в CRM, который вошёл, — для журнала */
  sub: string;
  crmClientId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  jti: string;
  exp: number;
}

export type CrmTicket = StaffTicket | ClientTicket;

export type TicketCheck =
  | { ok: true; ticket: CrmTicket }
  | { ok: false; reason: 'FORMAT' | 'SIGNATURE' | 'EXPIRED' | 'CLAIMS' };

const ISSUER = 'fattakhov-crm';
const AUDIENCE = 'fattakhov-students';
/** CRM выпускает билет на минуту; дольше пяти не принимаем ни при каких часах. */
const MAX_LIFETIME_SECONDS = 300;
/** Часы серверов расходятся — выпуск «из будущего» в пределах полуминуты не ошибка. */
const CLOCK_SKEW_SECONDS = 30;

/** Секрет из окружения; null — вход из CRM выключен. */
export function staffSsoSecret(): string | null {
  const raw = process.env.STUDENTS_SSO_SECRET?.trim();
  return raw && raw.length >= 32 ? raw : null;
}

export function verifyStaffTicket(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): TicketCheck {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'FORMAT' };

  // Подпись — до разбора содержимого: неподписанный JSON не читаем вовсе
  const expected = crypto.createHmac('sha256', secret).update(parts[0]).digest();
  const given = Buffer.from(parts[1], 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'SIGNATURE' };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: 'FORMAT' };
  }

  if (payload.v !== 1 || payload.iss !== ISSUER || payload.aud !== AUDIENCE) {
    return { ok: false, reason: 'CLAIMS' };
  }
  const iat = Number(payload.iat);
  const exp = Number(payload.exp);
  if (
    !Number.isFinite(iat) ||
    !Number.isFinite(exp) ||
    exp - iat > MAX_LIFETIME_SECONDS ||
    iat > nowSeconds + CLOCK_SKEW_SECONDS
  ) {
    return { ok: false, reason: 'CLAIMS' };
  }
  if (exp <= nowSeconds) return { ok: false, reason: 'EXPIRED' };

  if (
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    typeof payload.jti !== 'string' ||
    payload.jti.length < 16
  ) {
    return { ok: false, reason: 'CLAIMS' };
  }

  if (payload.kind === 'client') {
    const contactEmail = typeof payload.contactEmail === 'string' ? payload.contactEmail.trim().toLowerCase() : '';
    if (
      typeof payload.crmClientId !== 'string' ||
      !payload.crmClientId ||
      typeof payload.companyName !== 'string' ||
      !payload.companyName.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
    ) {
      return { ok: false, reason: 'CLAIMS' };
    }
    const contactName =
      typeof payload.contactName === 'string' && payload.contactName.trim()
        ? payload.contactName.trim().slice(0, 120)
        : 'Представитель компании';
    return {
      ok: true,
      ticket: {
        kind: 'client',
        sub: payload.sub,
        crmClientId: payload.crmClientId,
        companyName: payload.companyName.trim().slice(0, 200),
        contactName,
        contactEmail,
        jti: payload.jti,
        exp,
      },
    };
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const permissions = readStaffPermissions(payload.permissions) ?? [];
  if (
    payload.kind !== 'staff' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    permissions.length === 0
  ) {
    return { ok: false, reason: 'CLAIMS' };
  }

  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim().slice(0, 120) : 'Сотрудник агентства';
  const position = typeof payload.position === 'string' && payload.position.trim() ? payload.position.trim().slice(0, 120) : null;

  return {
    ok: true,
    ticket: { kind: 'staff', sub: payload.sub, email, name, position, permissions, jti: payload.jti, exp },
  };
}
