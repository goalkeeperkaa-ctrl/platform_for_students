import { z } from 'zod';
import {
  APPLICATION_STATUSES,
  GENDERS,
  MESSAGE_MAX_LENGTH,
  STUDENT_STATUSES,
  SWIPE_DIRECTIONS,
  WEEKDAYS,
} from '@/lib/types';

/**
 * Схемы валидации — один источник правды для клиента и сервера.
 *
 * Форма проверяет тем же кодом, что и роут: иначе на клиенте появляется
 * своя, чуть более мягкая версия правил, и до сервера доходят данные,
 * которые он молча отвергает без объяснений.
 */

const CURRENT_YEAR = new Date().getFullYear();

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Укажите почту')
  .email('Похоже на опечатку в адресе')
  .max(254)
  .transform((v) => v.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, 'Минимум 8 символов')
  .max(128, 'Слишком длинный пароль')
  .regex(/[a-zа-яё]/i, 'Добавьте хотя бы одну букву')
  .regex(/\d/, 'Добавьте хотя бы одну цифру');

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[\d\s()-]{10,20}$/, 'Формат: +7 900 000-00-00')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : null));

export const fullNameSchema = z
  .string()
  .trim()
  .min(3, 'Укажите фамилию и имя')
  .max(120)
  .regex(/^[А-Яа-яЁёA-Za-z\s'-]+$/, 'Только буквы, пробел и дефис');

/** Шаги мастера валидируются по отдельности — форма проверяет ровно то,
 *  что человек уже заполнил, а не всё сразу. */
export const registrationSteps = {
  identity: z.object({
    fullName: fullNameSchema,
    gender: z.enum(GENDERS),
    birthYear: z
      .number({ invalid_type_error: 'Укажите год рождения' })
      .int()
      .min(CURRENT_YEAR - 60, 'Проверьте год')
      .max(CURRENT_YEAR - 14, 'Платформа для студентов от 14 лет'),
  }),
  photo: z.object({
    photoUrl: z.string().max(500).nullable(),
  }),
  education: z.object({
    university: z.string().trim().min(2, 'Укажите вуз').max(160),
    speciality: z.string().trim().min(2, 'Укажите специальность').max(160),
    studyYear: z.number().int().min(1, 'От 1 курса').max(6, 'До 6 курса'),
    city: z.string().trim().max(80).nullable(),
  }),
  schedule: z.object({
    workDays: z.array(z.enum(WEEKDAYS)).min(1, 'Выберите хотя бы один день'),
    hoursPerWeek: z.number().int().min(4).max(60).nullable(),
  }),
  skills: z.object({
    skills: z.array(z.string().trim().min(1).max(40)).max(20, 'Не больше 20 навыков'),
    about: z.string().trim().max(600, 'Не длиннее 600 символов').nullable(),
    resumeUrl: z.string().max(500).nullable(),
    resumeName: z.string().max(200).nullable(),
  }),
  account: z.object({
    email: emailSchema,
    password: passwordSchema,
    phone: phoneSchema,
    consent: z.literal(true, {
      errorMap: () => ({ message: 'Без согласия на обработку данных регистрация невозможна' }),
    }),
  }),
} as const;

export const registrationSchema = registrationSteps.identity
  .merge(registrationSteps.photo)
  .merge(registrationSteps.education)
  .merge(registrationSteps.schedule)
  .merge(registrationSteps.skills)
  .merge(registrationSteps.account);

export type RegistrationInput = z.infer<typeof registrationSchema>;

/**
 * Изменение профиля.
 *
 * Собрано из тех же шагов, что и регистрация, а не переписано рядом:
 * два набора правил для одних и тех же полей разъезжаются на первой же
 * правке, и тогда анкета, прошедшая регистрацию, перестаёт сохраняться
 * при редактировании — или наоборот.
 *
 * Шага `account` здесь нет: почта — удостоверение, её смена требует
 * подтверждения нового адреса; пароль меняют отдельно; согласие на ПДн
 * — юридический факт с датой и версией, а не поле анкеты. Телефон из
 * этого шага нужен, поэтому добавлен отдельно.
 */
export const profileUpdateSchema = registrationSteps.identity
  .merge(registrationSteps.photo)
  .merge(registrationSteps.education)
  .merge(registrationSteps.schedule)
  .merge(registrationSteps.skills)
  .extend({ phone: phoneSchema });

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Введите пароль'),
});

export const employerCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(8, 'Код короче ожидаемого')
    .max(32)
    .transform((v) => v.toUpperCase()),
});

export const swipeSchema = z.object({
  vacancyId: z.string().min(1),
  direction: z.enum(SWIPE_DIRECTIONS),
});

export const undoSwipeSchema = z.object({
  vacancyId: z.string().min(1),
});

export const applicationStatusSchema = z.object({
  applicationId: z.string().min(1),
  status: z.enum(APPLICATION_STATUSES),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const studentStatusSchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(STUDENT_STATUSES),
});

export const messageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Сообщение пустое')
    .max(MESSAGE_MAX_LENGTH, `Не длиннее ${MESSAGE_MAX_LENGTH} символов`),
});

/** Загрузка файлов: тип и размер проверяются до записи на диск. */
export const UPLOAD_LIMITS = {
  photo: {
    maxBytes: 5 * 1024 * 1024,
    mime: ['image/jpeg', 'image/png', 'image/webp'],
    label: 'JPG, PNG или WebP до 5 МБ',
  },
  resume: {
    maxBytes: 8 * 1024 * 1024,
    mime: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    label: 'PDF или DOC/DOCX до 8 МБ',
  },
} as const;

export type UploadKind = keyof typeof UPLOAD_LIMITS;
