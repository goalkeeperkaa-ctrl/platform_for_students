import { z } from 'zod';
import { httpUrlSchema, linkItemSchema } from '@/lib/portfolio';
import { emailSchema, passwordSchema } from '@/lib/validation';
import type { CompanyProfile, LinkItem } from '@/lib/types';

/**
 * Компания: проверка регистрации и страницы, чтение из базы.
 *
 * Схемы общие для формы и сервера, как и остальные. Отдельным модулем,
 * потому что хранилищу нужны правила чтения JSON, а мастеру регистрации
 * студента правила компании ни к чему.
 */

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, `Не длиннее ${max} символов`).nullable());

/**
 * Картинка компании — только собственный загруженный файл компании.
 *
 * Не любая ссылка и не любой файл платформы. Логотип и фото компании
 * раздаются публично; позволь схема записать сюда путь к фото студента,
 * компания сделала бы чужие персональные данные открытыми, просто вписав
 * адрес. Поэтому путь сверяется с видом файла `company` и форматом имени,
 * который порождает хранилище.
 */
export const COMPANY_FILE_PATTERN = /^\/api\/files\/company\/[0-9a-f-]{36}\.(jpg|png|webp)$/i;

export const companyFileUrlSchema = z
  .string()
  .regex(COMPANY_FILE_PATTERN, 'Загрузите изображение через форму');

const companyName = z
  .string()
  .trim()
  .min(2, 'Укажите название компании')
  .max(120, 'Не длиннее 120 символов');

const contactName = z
  .string()
  .trim()
  .min(2, 'Укажите, кто будет вести кабинет')
  .max(120, 'Не длиннее 120 символов')
  .regex(/^[А-Яа-яЁёA-Za-z\s'-]+$/, 'Только буквы, пробел и дефис');

export const companyProfileSchema = z.object({
  companyName,
  contactName,
  logoUrl: z.preprocess(emptyToNull, companyFileUrlSchema.nullable()),
  industry: optionalText(80),
  about: optionalText(1500),
  culture: optionalText(1000),
  website: z.preprocess(emptyToNull, httpUrlSchema.nullable()),
  city: optionalText(80),
  socials: z.array(linkItemSchema).max(8, 'Не больше 8 ссылок'),
  photos: z.array(companyFileUrlSchema).max(6, 'Не больше 6 фото'),
  videoUrl: z.preprocess(emptyToNull, httpUrlSchema.nullable()),
});

export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

export const companyRegistrationSchema = z.object({
  companyName,
  contactName,
  email: emailSchema,
  password: passwordSchema,
  industry: optionalText(80),
  city: optionalText(80),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Без согласия на обработку данных регистрация невозможна' }),
  }),
});

export type CompanyRegistrationInput = z.infer<typeof companyRegistrationSchema>;

/**
 * Страница компании из строки базы.
 *
 * Соцсети лежат в JSON, фото — списком путей. Битый элемент
 * отбрасывается, а не роняет страницу; путь, не похожий на файл компании,
 * — тоже: иначе поправленная руками строка открыла бы чужой файл.
 */
export function readCompanyProfile(row: {
  companyName: string;
  contactName: string;
  logoUrl?: string | null;
  industry?: string | null;
  about?: string | null;
  culture?: string | null;
  website?: string | null;
  city?: string | null;
  socials?: unknown;
  photos?: unknown;
  videoUrl?: string | null;
}): CompanyProfile {
  const url = (value: unknown) =>
    typeof value === 'string' && httpUrlSchema.safeParse(value).success ? value : null;
  const file = (value: unknown) =>
    typeof value === 'string' && COMPANY_FILE_PATTERN.test(value) ? value : null;
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);

  const socials: LinkItem[] = Array.isArray(row.socials)
    ? row.socials.flatMap((item) => {
        const parsed = linkItemSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  const photos = Array.isArray(row.photos)
    ? row.photos.flatMap((p) => {
        const valid = file(p);
        return valid ? [valid] : [];
      })
    : [];

  return {
    companyName: row.companyName,
    contactName: row.contactName,
    logoUrl: file(row.logoUrl),
    industry: text(row.industry),
    about: text(row.about),
    culture: text(row.culture),
    website: url(row.website),
    city: text(row.city),
    socials,
    photos,
    videoUrl: url(row.videoUrl),
  };
}

/** Версия согласия контактного лица компании на обработку ПДн. */
export const COMPANY_CONSENT_VERSION = '2026-09-13';
