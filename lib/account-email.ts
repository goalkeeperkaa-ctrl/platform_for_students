import 'server-only';
import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_RESEND_SECONDS,
  EMAIL_CODE_TTL_MINUTES,
  PASSWORD_RESET_TTL_MINUTES,
  isExpired,
  minutesAfter,
  resendWaitSeconds,
} from '@/lib/account-codes';
import { appUrl } from '@/lib/app-url';
import { getStore } from '@/lib/db';
import { emailCodeMail, passwordResetMail } from '@/lib/mail/templates';
import { sendMail } from '@/lib/mail/transport';
import { blindIndex, decryptSafe, safeEqual } from '@/lib/security/crypto';
import { hashPassword } from '@/lib/security/password';
import { generateEmailCode, generateResetToken, hashEmailCode, hashResetToken } from '@/lib/security/tokens';
import { releasePendingApplications } from '@/lib/services';
import type { Role } from '@/lib/types';

/**
 * Подтверждение почты и восстановление пароля.
 *
 * Почта подтверждается кодом из письма, а не ссылкой: код набирают на
 * том же устройстве, где открыт кабинет, — ссылка из письма на телефоне
 * открылась бы в другом браузере, без сессии.
 */

export type SendCodeResult =
  | { status: 'SENT'; delivered: boolean; retryAfter: number }
  | { status: 'WAIT'; retryAfter: number }
  | { status: 'ALREADY_VERIFIED' }
  | { status: 'NO_ACCOUNT' };

export async function sendEmailCode(accountId: string): Promise<SendCodeResult> {
  const store = await getStore();
  const account = await store.accounts.findById(accountId);
  if (!account || !account.isActive) return { status: 'NO_ACCOUNT' };
  if (account.emailVerifiedAt) return { status: 'ALREADY_VERIFIED' };

  const last = await store.authTokens.latest(accountId, 'EMAIL_VERIFY');
  const wait = resendWaitSeconds(last?.createdAt ?? null);
  if (wait > 0) return { status: 'WAIT', retryAfter: wait };

  const code = generateEmailCode();
  await store.authTokens.issue({
    accountId,
    kind: 'EMAIL_VERIFY',
    tokenHash: hashEmailCode(accountId, code),
    expiresAt: minutesAfter(new Date(), EMAIL_CODE_TTL_MINUTES),
  });
  const delivered = await sendMail({
    to: decryptSafe(account.emailEnc),
    ...emailCodeMail({ code, minutes: EMAIL_CODE_TTL_MINUTES }),
  });
  return { status: 'SENT', delivered, retryAfter: EMAIL_CODE_RESEND_SECONDS };
}

export type VerifyCodeResult =
  | { status: 'VERIFIED'; released: string[] }
  | { status: 'ALREADY_VERIFIED' }
  | { status: 'WRONG'; attemptsLeft: number }
  | { status: 'LOCKED' }
  | { status: 'EXPIRED' }
  | { status: 'NO_CODE' };

/**
 * Проверка кода. Подтверждённая почта у студента с подтверждённой учёбой
 * отправляет работодателям ожидавшие отклики — их id возвращаются, чтобы
 * вызывающий разослал письма компаниям.
 */
export async function verifyEmailCode(accountId: string, code: string): Promise<VerifyCodeResult> {
  const store = await getStore();
  const account = await store.accounts.findById(accountId);
  if (!account || !account.isActive) return { status: 'NO_CODE' };
  if (account.emailVerifiedAt) return { status: 'ALREADY_VERIFIED' };

  const token = await store.authTokens.latest(accountId, 'EMAIL_VERIFY');
  if (!token) return { status: 'NO_CODE' };
  if (isExpired(token.expiresAt)) return { status: 'EXPIRED' };
  if (token.attempts >= EMAIL_CODE_MAX_ATTEMPTS) return { status: 'LOCKED' };

  if (!safeEqual(token.tokenHash, hashEmailCode(accountId, code))) {
    const attempts = await store.authTokens.recordFailure(token.id);
    return attempts >= EMAIL_CODE_MAX_ATTEMPTS
      ? { status: 'LOCKED' }
      : { status: 'WRONG', attemptsLeft: EMAIL_CODE_MAX_ATTEMPTS - attempts };
  }

  if (!(await store.authTokens.consume(token.id))) return { status: 'NO_CODE' };
  await store.accounts.markEmailVerified(accountId);

  let released: string[] = [];
  if (account.role === 'STUDENT') {
    const student = await store.students.findByAccountId(accountId);
    if (student) released = await releasePendingApplications(student.id);
  }
  return { status: 'VERIFIED', released };
}

/**
 * Письмо со ссылкой сброса пароля.
 *
 * Ничего не сообщает о том, есть ли такая почта: ответ одинаковый всегда,
 * а письмо отправляется, не задерживая ответ, — иначе разница во времени
 * выдала бы, какие адреса зарегистрированы. Работодателю из CRM без пароля
 * письмо не уходит: он входит по коду, который выдаёт менеджер.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const store = await getStore();
  const account = await store.accounts.findByEmailHash(blindIndex(email));
  if (!account || !account.isActive || !account.passwordHash) return;

  const last = await store.authTokens.latest(account.id, 'PASSWORD_RESET');
  if (resendWaitSeconds(last?.createdAt ?? null) > 0) return;

  const token = generateResetToken();
  await store.authTokens.issue({
    accountId: account.id,
    kind: 'PASSWORD_RESET',
    tokenHash: hashResetToken(token),
    expiresAt: minutesAfter(new Date(), PASSWORD_RESET_TTL_MINUTES),
  });
  void sendMail({
    to: decryptSafe(account.emailEnc),
    ...passwordResetMail({ url: appUrl(`/reset/${token}`), minutes: PASSWORD_RESET_TTL_MINUTES }),
  });
}

export type ResetTokenState = 'VALID' | 'INVALID' | 'EXPIRED';

/** Состояние ссылки — чтобы страница сразу сказала, что ссылка устарела, а не после ввода пароля. */
export async function checkResetToken(token: string): Promise<ResetTokenState> {
  if (!token || token.length > 200) return 'INVALID';
  const store = await getStore();
  const record = await store.authTokens.findActiveByHash('PASSWORD_RESET', hashResetToken(token));
  if (!record) return 'INVALID';
  return isExpired(record.expiresAt) ? 'EXPIRED' : 'VALID';
}

export type ResetResult =
  | { status: 'RESET'; accountId: string; role: Role }
  | { status: 'INVALID' }
  | { status: 'EXPIRED' };

export async function resetPassword(token: string, password: string): Promise<ResetResult> {
  const store = await getStore();
  const record = await store.authTokens.findActiveByHash('PASSWORD_RESET', hashResetToken(token));
  if (!record) return { status: 'INVALID' };
  if (isExpired(record.expiresAt)) return { status: 'EXPIRED' };

  const account = await store.accounts.findById(record.accountId);
  if (!account || !account.isActive) return { status: 'INVALID' };
  if (!(await store.authTokens.consume(record.id))) return { status: 'INVALID' };

  await store.accounts.setPassword(account.id, await hashPassword(password));
  // Ссылка пришла на эту почту и по ней перешли — владение ящиком доказано
  await store.accounts.markEmailVerified(account.id);
  return { status: 'RESET', accountId: account.id, role: account.role };
}
