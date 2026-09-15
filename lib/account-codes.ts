/**
 * Правила кодов подтверждения почты и ссылок сброса пароля.
 *
 * Чистый модуль без ключей и базы: сроки, паузы и маска адреса проверяются
 * модульными тестами. Генерация и хеши — в lib/security/tokens.ts.
 */

/** Шесть цифр: код набирают руками, часто с телефона, переключаясь из почты. */
export const EMAIL_CODE_LENGTH = 6;
export const EMAIL_CODE_TTL_MINUTES = 30;
/** После пятой ошибки код сгорает: шесть цифр иначе перебираются. */
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
/** Пауза между письмами с кодом — чтобы нетерпеливое «ещё раз» не заваливало ящик. */
export const EMAIL_CODE_RESEND_SECONDS = 60;
export const PASSWORD_RESET_TTL_MINUTES = 60;

export function minutesAfter(from: Date, minutes: number): Date {
  return new Date(from.getTime() + minutes * 60_000);
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** Сколько секунд ждать до следующего письма с кодом; 0 — можно отправлять. */
export function resendWaitSeconds(lastSentAt: Date | null, now: Date = new Date()): number {
  if (!lastSentAt) return 0;
  const left = EMAIL_CODE_RESEND_SECONDS * 1000 - (now.getTime() - lastSentAt.getTime());
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** Код из поля ввода: пробелы и дефисы, которые люди ставят сами, отбрасываются. */
export function normalizeCode(input: string): string {
  return input.replace(/\D/g, '');
}

export function isCodeShape(input: string): boolean {
  return new RegExp(`^\\d{${EMAIL_CODE_LENGTH}}$`).test(input);
}

/**
 * Адрес для подсказки «код отправлен на …»: первая буква и домен. Полный
 * адрес на экране не нужен — человек и так узнаёт свою почту, а экран
 * видит не только он.
 */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.trim().split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}
