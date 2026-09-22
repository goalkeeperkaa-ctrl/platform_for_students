import 'server-only';
import crypto from 'node:crypto';
import { EMAIL_CODE_LENGTH } from '@/lib/account-codes';
import { blindIndex } from './crypto';

/** Код подтверждения почты: равномерно случайные шесть цифр, с ведущими нулями. */
export function generateEmailCode(): string {
  return String(crypto.randomInt(0, 10 ** EMAIL_CODE_LENGTH)).padStart(EMAIL_CODE_LENGTH, '0');
}

/**
 * Хеш кода — с ключом приложения и привязкой к учётной записи. Шесть цифр
 * без ключа перебираются за секунды, а одинаковый код у двух человек не
 * должен давать одинаковый хеш.
 */
export function hashEmailCode(accountId: string, code: string): string {
  return blindIndex(`email-code:${accountId}:${code}`);
}

/**
 * Хеш кода для ещё не созданной учётной записи — ключ не accountId
 * (его пока нет), а сама почта, к которой привязана заявка.
 */
export function hashPendingCode(email: string, code: string): string {
  return blindIndex(`pending-code:${email.trim().toLowerCase()}:${code}`);
}

/** Токен ссылки сброса пароля: 256 бит, в ссылке — без символов, которые ломает почта. */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Хеш токена сброса. Без ключа, в отличие от кода: у токена 256 бит
 * случайности, перебирать нечего, а искать запись нужно по самому хешу.
 * Регистр сохраняется — base64url от него зависит.
 */
export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
