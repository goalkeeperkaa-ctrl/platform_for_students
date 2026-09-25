import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';

/**
 * Вход в CRM из студенческой платформы — билет в обратную сторону от
 * lib/security/staff-ticket.ts (тот принимает вход CRM → сюда, этот
 * подписывает выход отсюда → в CRM).
 *
 * Только для компании, уже объединённой с профилем в CRM (crmClientId
 * проставлен решением сотрудника — см. lib/services.ts resolveCrmLink).
 * Билет живёт минуту: этого хватает на переход, не на пересылку. Секрет —
 * CRM_ENTRY_SECRET, отдельный от CRM_SERVICE_SECRET (тот — для вызовов
 * сервер-сервер без билета) и от STUDENTS_SSO_SECRET (тот — для входа
 * в обратном направлении).
 */

export const CRM_ENTRY_TICKET_TTL_SECONDS = 60;

export interface CrmEntryTicket {
  v: 1;
  iss: 'fattakhov-students';
  aud: 'fattakhov-crm';
  crmClientId: string;
  email: string;
  iat: number;
  exp: number;
  jti: string;
}

/** Секрет из окружения; null — вход в CRM с этой платформы выключен. */
export function crmEntrySecret(): string | null {
  const raw = process.env.CRM_ENTRY_SECRET?.trim();
  return raw && raw.length >= 32 ? raw : null;
}

export function issueCrmEntryTicket(
  input: { crmClientId: string; email: string },
  secret: string,
  now: number = Date.now(),
): string {
  const iat = Math.floor(now / 1000);
  const payload: CrmEntryTicket = {
    v: 1,
    iss: 'fattakhov-students',
    aud: 'fattakhov-crm',
    crmClientId: input.crmClientId,
    email: input.email,
    iat,
    exp: iat + CRM_ENTRY_TICKET_TTL_SECONDS,
    jti: randomBytes(16).toString('base64url'),
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}
