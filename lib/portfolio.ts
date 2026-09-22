import { z } from 'zod';
import {
  ACTIVITY_KINDS,
  LOOKING_FOR,
  type AchievementItem,
  type ActivityItem,
  type LinkItem,
  type ProjectItem,
  type StudentPortfolio,
} from '@/lib/types';

/**
 * Портфолио: проверка формы, чтение сохранённого и заполненность профиля.
 *
 * Схемы — одни для клиента и сервера, как и остальные в lib/validation.ts.
 * Здесь отдельно, потому что те же схемы нужны хранилищу при чтении JSON
 * из базы, а тянуть туда все правила регистрации незачем.
 */

const CURRENT_YEAR = new Date().getFullYear();

/** Пустая строка из поля формы — это «не заполнено», а не значение. */
const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/**
 * Ссылка — только http и https.
 *
 * Ссылки из портфолио выводятся у работодателя как href. Схема
 * `javascript:` там исполнилась бы в его кабинете, с его сессией, — это
 * XSS, внесённый через анкету студента. `new URL()` такую ссылку считает
 * корректной, поэтому одной проверки «это URL» недостаточно.
 */
export const httpUrlSchema = z
  .string()
  .trim()
  .max(500, 'Слишком длинная ссылка')
  .url('Похоже, это не ссылка')
  .refine((v) => /^https?:\/\//i.test(v), 'Ссылка должна начинаться с http:// или https://');

/** Видео-визитка, загруженная файлом — по аналогии с COMPANY_FILE_PATTERN. */
export const STUDENT_VIDEO_FILE_PATTERN = /^\/api\/files\/studentVideo\/[0-9a-f-]{36}\.(mp4|webm)$/i;

/** Ссылка на видео-визитку: внешняя (YouTube и т.п.) или файл, загруженный через форму. */
export const studentVideoUrlSchema = z.union([httpUrlSchema, z.string().regex(STUDENT_VIDEO_FILE_PATTERN)]);

const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, `Не длиннее ${max} символов`).nullable());

export const projectItemSchema = z.object({
  title: z.string().trim().min(2, 'Назовите проект').max(120, 'Не длиннее 120 символов'),
  description: optionalText(600),
  link: z.preprocess(emptyToNull, httpUrlSchema.nullable()),
});

export const achievementItemSchema = z.object({
  title: z.string().trim().min(2, 'Назовите достижение').max(120, 'Не длиннее 120 символов'),
  description: optionalText(400),
  year: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.number().int().min(1990, 'Проверьте год').max(CURRENT_YEAR, 'Год ещё не наступил').nullable(),
  ),
});

export const activityItemSchema = z.object({
  kind: z.enum(ACTIVITY_KINDS),
  title: z.string().trim().min(2, 'Опишите занятие').max(120, 'Не длиннее 120 символов'),
  description: optionalText(400),
});

export const linkItemSchema = z.object({
  label: z.string().trim().min(1, 'Подпишите ссылку').max(60, 'Не длиннее 60 символов'),
  url: httpUrlSchema,
});

export const lookingForSchema = z
  .array(z.enum(LOOKING_FOR))
  .max(LOOKING_FOR.length)
  .transform((items) => [...new Set(items)]);

export const portfolioSchema = z.object({
  lookingFor: lookingForSchema,
  goals: optionalText(600),
  projects: z.array(projectItemSchema).max(10, 'Не больше 10 проектов'),
  achievements: z.array(achievementItemSchema).max(15, 'Не больше 15 достижений'),
  activities: z.array(activityItemSchema).max(10, 'Не больше 10 занятий'),
  hobbies: optionalText(400),
  links: z.array(linkItemSchema).max(10, 'Не больше 10 ссылок'),
  videoUrl: z.preprocess(emptyToNull, studentVideoUrlSchema.nullable()),
});

export const EMPTY_PORTFOLIO: StudentPortfolio = {
  lookingFor: [],
  goals: null,
  projects: [],
  achievements: [],
  activities: [],
  hobbies: null,
  links: [],
  videoUrl: null,
};

/**
 * Портфолио из строки базы.
 *
 * Списки лежат в JSON, и база их форму не проверяет. Строку могли поправить
 * руками или записать старой версией кода — такая не должна ронять ни
 * кабинет работодателя, ни профиль. Битый список читается как пустой,
 * битый элемент отбрасывается, остальное остаётся.
 */
export function readPortfolio(row: {
  lookingFor?: unknown;
  goals?: unknown;
  projects?: unknown;
  achievements?: unknown;
  activities?: unknown;
  hobbies?: unknown;
  links?: unknown;
  videoUrl?: unknown;
}): StudentPortfolio {
  function list<T>(value: unknown, schema: z.ZodTypeAny): T[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      const parsed = schema.safeParse(item);
      return parsed.success ? [parsed.data as T] : [];
    });
  }
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);
  const video = (value: unknown) =>
    typeof value === 'string' && studentVideoUrlSchema.safeParse(value).success ? value : null;
  const looking = lookingForSchema.safeParse(row.lookingFor ?? []);

  return {
    lookingFor: looking.success ? looking.data : [],
    goals: text(row.goals),
    projects: list<ProjectItem>(row.projects, projectItemSchema),
    achievements: list<AchievementItem>(row.achievements, achievementItemSchema),
    activities: list<ActivityItem>(row.activities, activityItemSchema),
    hobbies: text(row.hobbies),
    links: list<LinkItem>(row.links, linkItemSchema),
    videoUrl: video(row.videoUrl),
  };
}

/** Блоки, из которых складывается заполненность профиля. */
export const COMPLETENESS_BLOCKS = [
  { key: 'photo', label: 'Фото' },
  { key: 'about', label: 'Пара слов о себе' },
  { key: 'lookingFor', label: 'Что ищете' },
  { key: 'goals', label: 'Цели и интересы' },
  { key: 'skills', label: 'Навыки' },
  { key: 'projects', label: 'Проекты' },
  { key: 'achievements', label: 'Достижения' },
  { key: 'activities', label: 'Занятия и активность' },
  { key: 'hobbies', label: 'Хобби' },
  { key: 'proof', label: 'Резюме или ссылки' },
] as const;

type CompletenessKey = (typeof COMPLETENESS_BLOCKS)[number]['key'];

/**
 * Насколько заполнен профиль.
 *
 * Считается по блокам, а не по полям: десять навыков не должны перевешивать
 * пустые проекты. Видео-визитка не входит — на доске Miro она опциональна,
 * и профиль без неё полный. От этой же функции считается метрика пилота
 * «заполнили профиль достаточно полно».
 */
export function profileCompleteness(
  p: StudentPortfolio & {
    photoUrl: string | null;
    about: string | null;
    skills: string[];
    resumeUrl: string | null;
  },
): { percent: number; missing: string[] } {
  const done: Record<CompletenessKey, boolean> = {
    photo: Boolean(p.photoUrl),
    about: Boolean(p.about?.trim()),
    lookingFor: p.lookingFor.length > 0,
    goals: Boolean(p.goals?.trim()),
    skills: p.skills.length > 0,
    projects: p.projects.length > 0,
    achievements: p.achievements.length > 0,
    activities: p.activities.length > 0,
    hobbies: Boolean(p.hobbies?.trim()),
    proof: Boolean(p.resumeUrl) || p.links.length > 0,
  };
  const missing = COMPLETENESS_BLOCKS.filter((b) => !done[b.key]).map((b) => b.label);
  const percent = Math.round(
    ((COMPLETENESS_BLOCKS.length - missing.length) / COMPLETENESS_BLOCKS.length) * 100,
  );
  return { percent, missing };
}

/** Порог «профиль заполнен достаточно полно» — ориентир пилота из Miro. */
export const COMPLETE_PROFILE_PERCENT = 60;
