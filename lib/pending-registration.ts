import 'server-only';
import { EMAIL_CODE_MAX_ATTEMPTS, EMAIL_CODE_TTL_MINUTES, resendWaitSeconds } from '@/lib/account-codes';
import type { CompanyRegistrationInput } from '@/lib/company';
import { emailCodeMail } from '@/lib/mail/templates';
import { sendMail } from '@/lib/mail/transport';
import { decrypt, encrypt, safeEqual } from '@/lib/security/crypto';
import {
  signPendingRegistration,
  verifyPendingRegistration,
  type PendingRegistrationClaims,
} from '@/lib/security/session';
import { generateEmailCode, hashPendingCode } from '@/lib/security/tokens';
import type { RegistrationInput } from '@/lib/validation';

/**
 * Заявка на регистрацию: форма проверена и подписана, но учётной записи
 * ещё нет. Она появится только после верного кода — см. confirmPendingRegistration().
 * Между шагами данные едут в подписанном билете у клиента, а не в базе:
 * заводить строку в БД ради ещё не подтверждённого адреса значило бы
 * навсегда занимать его при любой опечатке.
 */

export type PendingKind = 'student' | 'employer';

export type PendingStudentData = RegistrationInput & { consentIp: string };
export type PendingEmployerData = CompanyRegistrationInput;

export interface IssuedPending {
  token: string;
  delivered: boolean;
  retryAfter: number;
}

export async function issuePendingRegistration(kind: PendingKind, email: string, data: unknown): Promise<IssuedPending> {
  const code = generateEmailCode();
  const token = await signPendingRegistration({
    kind,
    email,
    codeHash: hashPendingCode(email, code),
    attempts: 0,
    sentAt: Date.now(),
    payloadEnc: encrypt(JSON.stringify(data)),
  });
  const delivered = await sendMail({ to: email, ...emailCodeMail({ code, minutes: EMAIL_CODE_TTL_MINUTES }) });
  return { token, delivered, retryAfter: 60 };
}

export type ConfirmResult<T> =
  | { status: 'VERIFIED'; data: T }
  | { status: 'WRONG'; token: string; attemptsLeft: number }
  | { status: 'LOCKED' }
  | { status: 'BAD_TOKEN' };

/** Проверка кода. Создавать учётную запись здесь не входит в задачу — решает вызывающий. */
export async function confirmPendingRegistration<T>(
  kind: PendingKind,
  token: string,
  code: string,
): Promise<ConfirmResult<T>> {
  const claims = await verifyPendingRegistration(token);
  if (!claims || claims.kind !== kind) return { status: 'BAD_TOKEN' };
  if (claims.attempts >= EMAIL_CODE_MAX_ATTEMPTS) return { status: 'LOCKED' };

  if (!safeEqual(claims.codeHash, hashPendingCode(claims.email, code))) {
    const attempts = claims.attempts + 1;
    if (attempts >= EMAIL_CODE_MAX_ATTEMPTS) return { status: 'LOCKED' };
    const refreshed = await signPendingRegistration({ ...stripJwtFields(claims), attempts });
    return { status: 'WRONG', token: refreshed, attemptsLeft: EMAIL_CODE_MAX_ATTEMPTS - attempts };
  }

  const data = JSON.parse(decrypt(claims.payloadEnc)) as T;
  return { status: 'VERIFIED', data };
}

export type ResendResult =
  | { status: 'SENT'; token: string; delivered: boolean; retryAfter: number }
  | { status: 'WAIT'; retryAfter: number }
  | { status: 'BAD_TOKEN' };

export async function resendPendingRegistration(kind: PendingKind, token: string): Promise<ResendResult> {
  const claims = await verifyPendingRegistration(token);
  if (!claims || claims.kind !== kind) return { status: 'BAD_TOKEN' };

  const wait = resendWaitSeconds(new Date(claims.sentAt));
  if (wait > 0) return { status: 'WAIT', retryAfter: wait };

  const code = generateEmailCode();
  const refreshed = await signPendingRegistration({
    ...stripJwtFields(claims),
    codeHash: hashPendingCode(claims.email, code),
    attempts: 0,
    sentAt: Date.now(),
  });
  const delivered = await sendMail({ to: claims.email, ...emailCodeMail({ code, minutes: EMAIL_CODE_TTL_MINUTES }) });
  return { status: 'SENT', token: refreshed, delivered, retryAfter: 60 };
}

/** jose добавляет iat/exp/iss в payload при чтении — при повторной подписи их лучше проставить заново, а не тащить старые. */
function stripJwtFields(claims: PendingRegistrationClaims): Omit<PendingRegistrationClaims, keyof import('jose').JWTPayload> {
  const { iat: _iat, exp: _exp, iss: _iss, ...rest } = claims;
  return rest;
}
