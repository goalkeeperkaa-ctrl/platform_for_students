import { z } from 'zod';
import { COMPANY_FILE_PATTERN, companyFileUrlSchema } from '@/lib/company';
import { PILOT_CITY } from '@/lib/pilot';
import { httpUrlSchema } from '@/lib/portfolio';
import {
  EMPLOYMENT_TYPES,
  SALARY_PERIODS,
  WEEKDAYS,
  WORK_FORMATS,
  type EmploymentType,
  type ModerationStatus,
  type SalaryPeriod,
  type VacancyStatus,
  type Weekday,
  type WorkFormat,
} from '@/lib/types';

/**
 * Вакансия из кабинета компании: проверка формы, статусы, видимость.
 *
 * Схема общая для формы и сервера, как и остальные. Правило видимости
 * живёт здесь, в одном месте: его применяют лента, свайп, страница
 * компании и раздача фото. Разойдись один из них с остальными — студент
 * откликнулся бы на вакансию, которую не должен был увидеть.
 */

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, `Не длиннее ${max} символов`).nullable());

/** Те же пределы показывает форма */
export const VACANCY_LIMITS = {
  items: 12,
  learnings: 10,
  itemLength: 200,
  tags: 10,
  photos: 6,
  perEmployer: 100,
} as const;

const listField = (max: number) =>
  z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Пустой пункт')
        .max(VACANCY_LIMITS.itemLength, `Пункт не длиннее ${VACANCY_LIMITS.itemLength} символов`),
    )
    .max(max, `Не больше ${max} пунктов`);

const money = z
  .number({ invalid_type_error: 'Укажите число' })
  .int('Целое число')
  .min(0, 'Не меньше нуля')
  .max(10_000_000, 'Слишком большая сумма')
  .nullable();

const vacancyObject = z
  .object({
    title: z.string().trim().min(3, 'Укажите должность').max(120, 'Не длиннее 120 символов'),
    summary: z
      .string()
      .trim()
      .min(20, 'Опишите вакансию хотя бы парой предложений')
      .max(1500, 'Не длиннее 1500 символов'),
    responsibilities: listField(VACANCY_LIMITS.items).min(1, 'Добавьте хотя бы одну задачу'),
    requirements: listField(VACANCY_LIMITS.items),
    perks: listField(VACANCY_LIMITS.items),
    learnings: listField(VACANCY_LIMITS.learnings),
    team: optionalText(600),
    salaryFrom: money,
    salaryTo: money,
    salaryPeriod: z.enum(SALARY_PERIODS),
    city: z.string().trim().min(2, 'Укажите город').max(80, 'Не длиннее 80 символов'),
    district: optionalText(80),
    address: optionalText(160),
    addressDetails: optionalText(120),
    workFormat: z.enum(WORK_FORMATS),
    employmentType: z.enum(EMPLOYMENT_TYPES),
    shiftDays: z
      .array(z.enum(WEEKDAYS))
      .min(1, 'Выберите хотя бы один день')
      // Порядок недели и без повторов: форма присылает дни в порядке нажатия
      .transform((days) => WEEKDAYS.filter((d) => days.includes(d))),
    hoursPerWeek: z
      .number({ invalid_type_error: 'Укажите число' })
      .int('Целое число')
      .min(4, 'От 4 часов')
      .max(60, 'До 60 часов')
      .nullable(),
    tags: z
      .array(z.string().trim().min(1).max(40, 'Тег не длиннее 40 символов'))
      .max(VACANCY_LIMITS.tags, `Не больше ${VACANCY_LIMITS.tags} тегов`)
      .transform((tags) => Array.from(new Set(tags))),
    // Фото вакансии — только собственные файлы компании, по той же причине,
    // что и логотип: иначе вписанный путь открыл бы публично чужой файл
    photos: z
      .array(companyFileUrlSchema)
      .max(VACANCY_LIMITS.photos, `Не больше ${VACANCY_LIMITS.photos} фото`)
      .transform((photos) => Array.from(new Set(photos))),
    videoUrl: z.preprocess(emptyToNull, httpUrlSchema.nullable()),
  });

export const vacancyInputSchema = vacancyObject.superRefine((v, ctx) => {
  if (v.salaryFrom !== null && v.salaryTo !== null && v.salaryTo < v.salaryFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['salaryTo'], message: '«До» меньше, чем «от»' });
  }
  // Куда ехать — первый вопрос студента к вакансии. Удалённой адрес не нужен
  if (v.workFormat !== 'REMOTE' && (!v.address || v.address.length < 5)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['address'], message: 'Укажите улицу и дом, где предстоит работать' });
  }
});

export type VacancyInput = z.infer<typeof vacancyInputSchema>;

/**
 * Сохранение из формы: поля вакансии плюс «отправить на проверку».
 * Статуса в запросе нет — его выставляет сервер.
 */
export const vacancySaveSchema = z.object({ submit: z.boolean().default(false) });

export const vacancyActionSchema = z.object({ action: z.enum(['submit', 'close']) });

export const moderationDecisionSchema = z
  .object({
    entity: z.enum(['company', 'vacancy']),
    id: z.string().min(1),
    decision: z.enum(['APPROVE', 'REJECT']),
    // Версия вакансии, которую видел HR (время последнего изменения)
    version: z.string().max(64).optional(),
    note: z
      .preprocess(emptyToNull, z.string().trim().max(500, 'Не длиннее 500 символов').nullable())
      .optional(),
  })
  .superRefine((v, ctx) => {
    // Отказ без причины оставляет компанию гадать, что поправить
    if (v.decision === 'REJECT' && (!v.note || v.note.length < 5)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'Напишите причину — компания увидит её в кабинете',
      });
    }
  });

/** Видит ли вакансию студент: опубликована, не снята, компания одобрена. */
export function isVacancyVisible(
  vacancy: { isActive: boolean; status: VacancyStatus },
  employer: { moderationStatus: ModerationStatus } | null | undefined,
): boolean {
  return vacancy.isActive && vacancy.status === 'PUBLISHED' && employer?.moderationStatus === 'APPROVED';
}

/** Из каких статусов вакансию можно отправить на проверку. */
export const SUBMITTABLE_STATUSES: readonly VacancyStatus[] = ['DRAFT', 'REJECTED', 'CLOSED'];

/**
 * Статус после сохранения из кабинета.
 *
 * Опубликованная вакансия после любой правки уходит на повторную проверку:
 * иначе одобренную «Бариста» можно было бы переписать во что угодно, не
 * показав агентству. Остальные статусы правка не меняет — меняет явное
 * «отправить на проверку».
 */
export function statusAfterEdit(current: VacancyStatus, submit: boolean): VacancyStatus {
  if (submit || current === 'PUBLISHED') return 'PENDING';
  return current;
}

/**
 * Медиа вакансии из строки базы. Путь, не похожий на файл компании, и
 * ссылка не по http(s) отбрасываются: поправленная руками строка не должна
 * открыть чужой файл или вставить javascript: в ссылку.
 */
export function readVacancyMedia<T extends { photos: string[]; videoUrl: string | null }>(row: T): T {
  return {
    ...row,
    photos: row.photos.filter((p) => COMPANY_FILE_PATTERN.test(p)),
    videoUrl: row.videoUrl && httpUrlSchema.safeParse(row.videoUrl).success ? row.videoUrl : null,
  };
}

const CONTENT_KEYS = [
  'title',
  'summary',
  'responsibilities',
  'requirements',
  'perks',
  'learnings',
  'team',
  'salaryFrom',
  'salaryTo',
  'salaryPeriod',
  'city',
  'district',
  'address',
  'addressDetails',
  'workFormat',
  'employmentType',
  'shiftDays',
  'hoursPerWeek',
  'tags',
  'photos',
  'videoUrl',
] as const;

/** Содержимое вакансии — ровно то, что проверяет модерация. Для снимка при одобрении. */
export function vacancyContentOf(vacancy: VacancyInput): VacancyInput {
  return Object.fromEntries(CONTENT_KEYS.map((key) => [key, vacancy[key]])) as VacancyInput;
}

/**
 * Снимок одобренной версии из базы. Битый снимок — null: лучше показать
 * текущую версию, чем уронить студенту раздел «Отклики».
 */
export function readApprovedContent(value: unknown): VacancyInput | null {
  if (!value || typeof value !== 'object') return null;
  // Снимок, одобренный до появления адреса, адреса не содержит — это не
  // повод его терять: читаем без правила «адрес обязателен»
  const parsed = vacancyObject.safeParse({ address: null, addressDetails: null, ...(value as object) });
  return parsed.success ? parsed.data : null;
}

/**
 * Вакансия глазами студента, который с ней уже связан: откликнулся,
 * пропустил, переписывается.
 *
 * Видна в ленте — показывается как есть. Скрыта (правка ждёт проверки,
 * компания на модерации, вакансия снята) — показывается последняя
 * одобренная версия: непроверенный текст не должен доходить до студентов
 * в обход модерации — ни через ленту, ни через «Отклики» и переписку.
 */
export function studentFacingVacancy<
  T extends VacancyInput & { isActive: boolean; status: VacancyStatus; approvedContent: VacancyInput | null },
>(vacancy: T, employer: { moderationStatus: ModerationStatus } | null | undefined): T {
  if (isVacancyVisible(vacancy, employer) || !vacancy.approvedContent) return vacancy;
  return { ...vacancy, ...vacancy.approvedContent };
}

/** Форма вакансии: числа и списки — строками, как их вводит человек. */
export interface VacancyFormState {
  title: string;
  summary: string;
  responsibilities: string;
  requirements: string;
  perks: string;
  learnings: string;
  team: string;
  salaryFrom: string;
  salaryTo: string;
  salaryPeriod: SalaryPeriod;
  city: string;
  district: string;
  address: string;
  addressDetails: string;
  workFormat: WorkFormat;
  employmentType: EmploymentType;
  shiftDays: Weekday[];
  hoursPerWeek: string;
  tags: string[];
  photos: string[];
  videoUrl: string;
}

export const EMPTY_VACANCY_FORM: VacancyFormState = {
  title: '',
  summary: '',
  responsibilities: '',
  requirements: '',
  perks: '',
  learnings: '',
  team: '',
  salaryFrom: '',
  salaryTo: '',
  salaryPeriod: 'MONTH',
  city: PILOT_CITY,
  district: '',
  address: '',
  addressDetails: '',
  workFormat: 'ONSITE',
  employmentType: 'PART_TIME',
  shiftDays: [],
  hoursPerWeek: '',
  tags: [],
  photos: [],
  videoUrl: '',
};

export function vacancyToForm(v: VacancyInput): VacancyFormState {
  const numberText = (n: number | null) => (n === null ? '' : String(n));
  return {
    title: v.title,
    summary: v.summary,
    responsibilities: v.responsibilities.join('\n'),
    requirements: v.requirements.join('\n'),
    perks: v.perks.join('\n'),
    learnings: v.learnings.join('\n'),
    team: v.team ?? '',
    salaryFrom: numberText(v.salaryFrom),
    salaryTo: numberText(v.salaryTo),
    salaryPeriod: v.salaryPeriod,
    city: v.city,
    district: v.district ?? '',
    address: v.address ?? '',
    addressDetails: v.addressDetails ?? '',
    workFormat: v.workFormat,
    employmentType: v.employmentType,
    shiftDays: [...v.shiftDays],
    hoursPerWeek: numberText(v.hoursPerWeek),
    tags: [...v.tags],
    photos: [...v.photos],
    videoUrl: v.videoUrl ?? '',
  };
}

/** Тело запроса из формы: пункт списка — строка текста, пустое число — null. */
export function formToVacancyPayload(form: VacancyFormState) {
  const lines = (value: string) =>
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  const number = (value: string) => (value.trim() === '' ? null : Number(value));

  return {
    title: form.title,
    summary: form.summary,
    responsibilities: lines(form.responsibilities),
    requirements: lines(form.requirements),
    perks: lines(form.perks),
    learnings: lines(form.learnings),
    team: form.team.trim() ? form.team : null,
    salaryFrom: number(form.salaryFrom),
    salaryTo: number(form.salaryTo),
    salaryPeriod: form.salaryPeriod,
    city: form.city,
    district: form.district.trim() ? form.district : null,
    address: form.address.trim() ? form.address : null,
    addressDetails: form.addressDetails.trim() ? form.addressDetails : null,
    workFormat: form.workFormat,
    employmentType: form.employmentType,
    shiftDays: form.shiftDays,
    hoursPerWeek: number(form.hoursPerWeek),
    tags: form.tags,
    photos: form.photos,
    videoUrl: form.videoUrl.trim() ? form.videoUrl : null,
  };
}

/** Адрес, где компания уже нанимала, — чтобы сеть точек не вписывала его заново. */
export interface CompanyAddress {
  city: string;
  district: string | null;
  address: string;
  addressDetails: string | null;
}

/** Ссылка на Яндекс Карты по адресу — без ключа и платного API. */
export function mapUrl(city: string, address: string): string {
  return `https://yandex.ru/maps/?text=${encodeURIComponent(`${city}, ${address}`)}`;
}
