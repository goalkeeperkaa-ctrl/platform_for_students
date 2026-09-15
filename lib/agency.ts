/** Сайт агентства в разработке: свой dev-сервер рядом с этим. */
const AGENCY_LOCAL = 'http://localhost:3000';

/**
 * Адрес сайта агентства — отдельного приложения: лендинг и кабинеты
 * агентства и клиентов. Студенческая платформа ссылается на него с
 * витрины, чтобы компания или вуз нашли агентство целиком.
 *
 * На проде без AGENCY_SITE_URL ссылки нет: localhost посетителю ни к чему.
 */
export function agencySiteUrl(): string | null {
  const raw = process.env.AGENCY_SITE_URL?.trim();
  if (raw) return raw.replace(/\/+$/, '');
  return process.env.NODE_ENV === 'production' ? null : AGENCY_LOCAL;
}
