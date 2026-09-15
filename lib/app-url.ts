/** Платформа в разработке: порт, на котором её запускают рядом с сайтом агентства. */
const LOCAL = 'http://localhost:3001';

/**
 * Адрес платформы для ссылок в письмах.
 *
 * Ссылка из письма открывается вне сайта, относительная там не сработает.
 * В production APP_URL обязателен — это проверяет instrumentation.ts, иначе
 * студент получил бы письмо со ссылкой на localhost.
 */
export function appOrigin(): string {
  const raw = process.env.APP_URL?.trim();
  return raw ? raw.replace(/\/+$/, '') : LOCAL;
}

/** Абсолютная ссылка на страницу платформы. Путь начинается со слэша. */
export function appUrl(path = ''): string {
  return `${appOrigin()}${path}`;
}
