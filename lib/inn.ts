/**
 * ИНН: формат и контрольные цифры.
 *
 * Проверка контрольных цифр не говорит, что компания существует, — это
 * сверяет HR-менеджер по госреестру. Но она ловит опечатку сразу, в форме:
 * без неё компания с перепутанной цифрой уходила бы на модерацию, и HR
 * тратил бы звонок на то, что ловится арифметикой.
 *
 * Модуль без зависимостей: одно правило для формы и сервера.
 */

const WEIGHTS_10 = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const WEIGHTS_11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const WEIGHTS_12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

function checkDigit(digits: number[], weights: number[]): number {
  const sum = weights.reduce((acc, weight, i) => acc + weight * digits[i], 0);
  return (sum % 11) % 10;
}

export function normalizeInn(value: string): string {
  return value.replace(/\D/g, '');
}

/** 10 цифр — организация, 12 — индивидуальный предприниматель. */
export function isValidInn(value: string): boolean {
  if (!/^\d{10}$|^\d{12}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  if (digits.length === 10) return checkDigit(digits, WEIGHTS_10) === digits[9];
  return checkDigit(digits, WEIGHTS_11) === digits[10] && checkDigit(digits, WEIGHTS_12) === digits[11];
}

export function innKind(value: string): 'LEGAL' | 'INDIVIDUAL' | null {
  if (!isValidInn(value)) return null;
  return value.length === 10 ? 'LEGAL' : 'INDIVIDUAL';
}
