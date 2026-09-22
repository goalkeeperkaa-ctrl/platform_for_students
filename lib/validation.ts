import { z } from 'zod';
import { isCodeShape, normalizeCode } from '@/lib/account-codes';
import { MAX_AGE, MIN_AGE, fullYears, parseIsoDate, todayInMoscow } from '@/lib/age';
import { lookingForSchema, portfolioSchema } from '@/lib/portfolio';
import { MAX_HOURS_PER_WEEK, MIN_HOURS_PER_WEEK, maxHoursPerWeek } from '@/lib/schedule';
import { STUDY_FILE_PATTERN } from '@/lib/study';
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

const PHONE_PATTERN = /^\+?[\d\s()-]{10,20}$/;

export const phoneSchema = z
  .string()
  .trim()
  .regex(PHONE_PATTERN, 'Формат: +7 900 000-00-00')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : null));

/** Телефон, без которого нельзя: у компании по нему звонит HR-менеджер. */
export const requiredPhoneSchema = z
  .string({ invalid_type_error: 'Укажите телефон' })
  .trim()
  .min(1, 'Укажите телефон')
  .regex(PHONE_PATTERN, 'Формат: +7 900 000-00-00');

export const fullNameSchema = z
  .string()
  .trim()
  .min(3, 'Укажите фамилию и имя')
  .max(120)
  .regex(/^[А-Яа-яЁёA-Za-z\s'-]+$/, 'Только буквы, пробел и дефис');

/**
 * Полная дата рождения, «ГГГГ-ММ-ДД». С 18 лет до решения юриста:
 * согласие на обработку ПДн несовершеннолетнего даёт законный
 * представитель, а механизма для этого на платформе нет. По одному году
 * порог не проверить — отсюда день и месяц.
 */
export const birthDateSchema = z.string({ invalid_type_error: 'Укажите дату рождения' }).superRefine((value, ctx) => {
  const birth = parseIsoDate(value);
  if (!birth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? 'Такой даты нет — проверьте день и месяц'
        : 'Укажите день, месяц и год рождения',
    });
    return;
  }
  const age = fullYears(birth, todayInMoscow());
  if (age < MIN_AGE) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Регистрация — с ${MIN_AGE} лет` });
  } else if (age > MAX_AGE) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Проверьте год рождения' });
  }
});

const scheduleObject = z.object({
  workDays: z.array(z.enum(WEEKDAYS)).min(1, 'Выберите хотя бы один день'),
  hoursPerWeek: z
    .number()
    .int()
    .min(MIN_HOURS_PER_WEEK, `От ${MIN_HOURS_PER_WEEK} часов`)
    .max(MAX_HOURS_PER_WEEK, `Не больше ${MAX_HOURS_PER_WEEK} часов в неделю`)
    .nullable(),
});

/**
 * Часы должны помещаться в дни: один день и сорок часов — не график, а
 * опечатка. Отдельной функцией, а не .superRefine на шаге: схема с
 * уточнением перестаёт быть объектом, и её нельзя склеить с другими
 * шагами через merge — поэтому правило навешивается уже на склейку.
 */
function scheduleRule(value: { workDays: readonly string[]; hoursPerWeek: number | null }, ctx: z.RefinementCtx) {
  const days = new Set(value.workDays).size;
  if (value.hoursPerWeek === null || days === 0) return;
  const max = maxHoursPerWeek(days);
  if (value.hoursPerWeek > max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['hoursPerWeek'],
      message: `При ${days === 1 ? 'одном дне' : days + ' днях'} — не больше ${max} часов в неделю`,
    });
  }
}

/** Шаги мастера валидируются по отдельности — форма проверяет ровно то,
 *  что человек уже заполнил, а не всё сразу. */
export const registrationSteps = {
  identity: z.object({
    fullName: fullNameSchema,
    gender: z.enum(GENDERS),
    birthDate: birthDateSchema,
  }),
  photo: z.object({
    photoUrl: z.string().max(500).nullable(),
  }),
  education: z.object({
    university: z.string().trim().min(2, 'Укажите вуз').max(160),
    // Вуз из справочника. null — вписан вручную; undefined — клиент о
    // справочнике не знает, и сервер решает сам (см. /api/students/me)
    institutionId: z.string().trim().min(1).max(64).nullable().optional(),
    speciality: z.string().trim().min(2, 'Укажите специальность').max(160),
    studyYear: z.number().int().min(1, 'От 1 курса').max(6, 'До 6 курса'),
    city: z.string().trim().max(80).nullable(),
  }),
  schedule: scheduleObject.superRefine(scheduleRule),
  skills: z.object({
    skills: z.array(z.string().trim().min(1).max(40)).max(20, 'Не больше 20 навыков'),
    lookingFor: lookingForSchema.default([]),
    about: z.string().trim().max(600, 'Не длиннее 600 символов').nullable(),
    resumeUrl: z.string().max(500).nullable(),
    resumeName: z.string().max(200).nullable(),
  }),
  account: z.object({
    email: emailSchema,
    password: passwordSchema,
    phone: phoneSchema,
    ...consentFields(),
  }),
} as const;

/**
 * Три отметки согласия: на ПДн и соглашение — обязательные, рассылка — нет.
 * Общие для студента и компании: разные тексты, одно правило.
 */
export function consentFields() {
  return {
    consent: z.literal(true, {
      errorMap: () => ({ message: 'Без согласия на обработку персональных данных регистрация невозможна' }),
    }),
    terms: z.literal(true, {
      errorMap: () => ({ message: 'Примите пользовательское соглашение' }),
    }),
    marketing: z.boolean().default(false),
  };
}

export const registrationSchema = registrationSteps.identity
  .merge(registrationSteps.photo)
  .merge(registrationSteps.education)
  .merge(scheduleObject)
  .merge(registrationSteps.skills)
  .merge(registrationSteps.account)
  .superRefine(scheduleRule);

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
  .merge(scheduleObject)
  .merge(registrationSteps.skills)
  .extend({ phone: phoneSchema })
  // Портфолио частично: поле, которого нет в запросе, не меняется
  .merge(portfolioSchema.partial())
  .superRefine(scheduleRule);

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Введите пароль'),
});

/** Код из письма: пробелы и дефисы, которые люди ставят сами, не мешают. */
export const emailCodeSchema = z.object({
  code: z.string().transform(normalizeCode).refine(isCodeShape, 'Код — шесть цифр из письма'),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20, 'Ссылка неполная — откройте её из письма целиком').max(200, 'Ссылка неполная'),
  password: passwordSchema,
});

export const notificationSettingsSchema = z.object({ email: z.boolean() });

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

/** Работодатель открыл карточку кандидата. */
export const applicationViewSchema = z.object({
  applicationId: z.string().min(1),
});

/**
 * HR меняет студента: статус в работе, подтверждение учёбы, решение по
 * справке. Отказ по справке — только с причиной: студент видит её в
 * профиле, и без неё не знает, что загрузить вместо.
 */
export const adminStudentUpdateSchema = z
  .object({
    studentId: z.string().min(1),
    status: z.enum(STUDENT_STATUSES).optional(),
    studyVerified: z.boolean().optional(),
    studyDecision: z.enum(['APPROVE', 'REJECT']).optional(),
    note: z.string().trim().max(500, 'Не длиннее 500 символов').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === undefined && v.studyVerified === undefined && v.studyDecision === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Нечего менять', path: ['_'] });
    }
    if (v.studyDecision === 'REJECT' && (!v.note || v.note.length < 5)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['note'], message: 'Напишите причину — студент увидит её в профиле' });
    }
  });

/** Справка на проверку: файл вида `study`, загруженный через платформу. */
export const studyDocSchema = z.object({
  url: z.string().regex(STUDY_FILE_PATTERN, 'Загрузите файл через форму'),
  name: z.string().trim().min(1, 'Нет имени файла').max(200),
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
  // Логотип и фото компании. Отдельный вид, а не photo: эти файлы
  // раздаются публично, а фото студентов — только тем, кому положено.
  // Смешать их в одном каталоге значит однажды открыть не тот файл.
  company: {
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
  // Справка об обучении или фото студенческого. Видит только HR, файл
  // удаляется сразу после проверки
  study: {
    maxBytes: 8 * 1024 * 1024,
    mime: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    label: 'PDF, JPG, PNG или WebP до 8 МБ',
  },
  // Видео о компании и видео вакансии — публичные, льёт работодатель.
  // Тот же бакет для обоих, как и с company-фото: у вакансии нет своего
  // владельца отдельно от компании.
  companyVideo: {
    maxBytes: 50 * 1024 * 1024,
    mime: ['video/mp4', 'video/webm'],
    label: 'MP4 или WebM до 50 МБ',
  },
  // Видео-визитка студента. Видит сам студент и те, кому он откликнулся —
  // как фото и резюме, поэтому отдельный вид, а не companyVideo.
  studentVideo: {
    maxBytes: 50 * 1024 * 1024,
    mime: ['video/mp4', 'video/webm'],
    label: 'MP4 или WebM до 50 МБ',
  },
} as const;

export type UploadKind = keyof typeof UPLOAD_LIMITS;
