/**
 * Доменные типы платформы.
 *
 * Namely: эти типы, а не сгенерированные Prisma, — контракт между слоем
 * данных и интерфейсом. Клиентские компоненты не должны тянуть
 * @prisma/client в бандл, а сами значения обязаны совпадать с enum'ами
 * в prisma/schema.prisma один в один.
 */

export const ROLES = ['STUDENT', 'EMPLOYER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const GENDERS = ['MALE', 'FEMALE', 'UNSPECIFIED'] as const;
export type Gender = (typeof GENDERS)[number];

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Что студент ищет. Сразу несколько: стажировка не исключает подработку. */
export const LOOKING_FOR = ['JOB', 'INTERNSHIP', 'PROJECT'] as const;
export type LookingFor = (typeof LOOKING_FOR)[number];
export const LOOKING_FOR_LABEL: Record<LookingFor, string> = {
  JOB: 'Работа',
  INTERNSHIP: 'Стажировка',
  PROJECT: 'Проект',
};

/**
 * Виды занятий вне учёбы — три группы с доски Miro. Разделены, потому что
 * работодатель читает их по-разному: спорт говорит о дисциплине, доп.
 * обучение — об интересе, активность в вузе — об инициативе.
 */
export const ACTIVITY_KINDS = ['SPORT', 'EDUCATION', 'COMMUNITY'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  SPORT: 'Спорт и долгие занятия',
  EDUCATION: 'Доп. обучение: школы, языки, кружки',
  COMMUNITY: 'Активность в учёбе: староста, волонтёр, клубы',
};

export interface ProjectItem {
  title: string;
  description: string | null;
  link: string | null;
}

export interface AchievementItem {
  title: string;
  description: string | null;
  year: number | null;
}

export interface ActivityItem {
  kind: ActivityKind;
  title: string;
  description: string | null;
}

export interface LinkItem {
  label: string;
  url: string;
}

/**
 * Портфолио студента — то, что показывает человека шире резюме.
 *
 * Участие здесь тоже опыт: не только «победил», но и «делал, пробовал,
 * организовывал». Поэтому достижения и занятия — отдельные блоки, а не
 * одна строка «опыт работы», которой у студента обычно нет.
 */
export interface StudentPortfolio {
  lookingFor: LookingFor[];
  goals: string | null;
  projects: ProjectItem[];
  achievements: AchievementItem[];
  activities: ActivityItem[];
  hobbies: string | null;
  links: LinkItem[];
  videoUrl: string | null;
}

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  MON: 'Пн',
  TUE: 'Вт',
  WED: 'Ср',
  THU: 'Чт',
  FRI: 'Пт',
  SAT: 'Сб',
  SUN: 'Вс',
};

export const WORK_FORMATS = ['ONSITE', 'HYBRID', 'REMOTE'] as const;
export type WorkFormat = (typeof WORK_FORMATS)[number];

export const WORK_FORMAT_LABEL: Record<WorkFormat, string> = {
  ONSITE: 'В офисе',
  HYBRID: 'Гибрид',
  REMOTE: 'Удалённо',
};

export const EMPLOYMENT_TYPES = ['PART_TIME', 'SHIFT', 'PROJECT', 'INTERNSHIP', 'FULL_TIME'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  PART_TIME: 'Подработка',
  SHIFT: 'Сменный график',
  PROJECT: 'Проект',
  INTERNSHIP: 'Стажировка',
  FULL_TIME: 'Полный день',
};

export const SWIPE_DIRECTIONS = ['RIGHT', 'LEFT'] as const;
export type SwipeDirection = (typeof SWIPE_DIRECTIONS)[number];

export const APPLICATION_STATUSES = [
  'NEW',
  'VIEWED',
  'INVITED',
  'INTERVIEW',
  'HIRED',
  'REJECTED',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  NEW: 'Новый отклик',
  VIEWED: 'Просмотрен',
  INVITED: 'Приглашение',
  INTERVIEW: 'Собеседование',
  HIRED: 'Вышел на работу',
  REJECTED: 'Отказ',
};

/** Порядок = порядок воронки. Используется и в таймлайне, и в статистике. */
export const APPLICATION_FUNNEL: ApplicationStatus[] = [
  'NEW',
  'VIEWED',
  'INVITED',
  'INTERVIEW',
  'HIRED',
];

export const STUDENT_STATUSES = ['ACTIVE', 'IN_PROGRESS', 'PLACED', 'PAUSED'] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const STUDENT_STATUS_LABEL: Record<StudentStatus, string> = {
  ACTIVE: 'Ищет',
  IN_PROGRESS: 'В процессе',
  PLACED: 'Трудоустроен',
  PAUSED: 'На паузе',
};

export const SYNC_STATUSES = ['RUNNING', 'SUCCESS', 'FAILED'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

// ============ DTO, которые уходят в браузер ============
// Персональные данные расшифрованы ровно настолько, насколько их имеет
// право видеть получатель: студент видит себя целиком, работодатель —
// только отклики на свои вакансии, админ — всё.

export interface VacancyDTO {
  id: string;
  title: string;
  company: string;
  companyLogoUrl: string | null;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  perks: string[];
  salaryFrom: number | null;
  salaryTo: number | null;
  salaryPeriod: 'MONTH' | 'SHIFT' | 'HOUR';
  city: string;
  district: string | null;
  workFormat: WorkFormat;
  employmentType: EmploymentType;
  shiftDays: Weekday[];
  hoursPerWeek: number | null;
  tags: string[];
  isHot: boolean;
  publishedAt: string;
  /** 0..100 — совпадение с профилем студента. null для гостя. */
  matchScore: number | null;
  matchReasons: string[];
}

export interface StudentProfileDTO extends StudentPortfolio {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  gender: Gender;
  birthYear: number;
  photoUrl: string | null;
  resumeUrl: string | null;
  resumeName: string | null;
  university: string;
  speciality: string;
  studyYear: number;
  city: string | null;
  workDays: Weekday[];
  hoursPerWeek: number | null;
  skills: string[];
  about: string | null;
  status: StudentStatus;
  createdAt: string;
}

export interface ApplicationDTO {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  statusChangedAt: string;
  employerNote: string | null;
  vacancy: VacancyDTO;
}

export interface EmployerApplicationDTO {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  statusChangedAt: string;
  employerNote: string | null;
  vacancyId: string;
  vacancyTitle: string;
  student: StudentProfileDTO;
}

export interface SkippedDTO {
  id: string;
  createdAt: string;
  vacancy: VacancyDTO;
}

export interface SessionUser {
  accountId: string;
  role: Role;
  /** Профиль студента / работодателя, если он есть */
  profileId: string | null;
  name: string;
}

export interface AdminStats {
  students: {
    total: number;
    byStatus: Record<StudentStatus, number>;
    newThisWeek: number;
  };
  swipes: { right: number; left: number; total: number };
  applications: {
    total: number;
    byStatus: Record<ApplicationStatus, number>;
    conversion: number;
  };
  vacancies: { active: number; total: number };
  inProgress: Array<{
    studentId: string;
    fullName: string;
    photoUrl: string | null;
    university: string;
    vacancyTitle: string;
    company: string;
    status: ApplicationStatus;
    updatedAt: string;
  }>;
  lastSync: SyncRunDTO | null;
}

export interface SyncRunDTO {
  id: string;
  source: string;
  status: SyncStatus;
  startedAt: string;
  finishedAt: string | null;
  created: number;
  updated: number;
  deactivated: number;
  error: string | null;
}

export interface AuditEntryDTO {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  actorLabel: string;
  ip: string | null;
  createdAt: string;
}

// ============ ПЕРЕПИСКА ============

export const MESSAGE_AUTHORS = ['STUDENT', 'EMPLOYER'] as const;
export type MessageAuthor = (typeof MESSAGE_AUTHORS)[number];

export interface MessageDTO {
  id: string;
  author: MessageAuthor;
  body: string;
  createdAt: string;
  readAt: string | null;
  /** Написано тем, кто сейчас смотрит. Считается на сервере: клиенту
   *  незачем знать, кто он, чтобы разложить сообщения по сторонам. */
  mine: boolean;
}

export interface ThreadSummaryDTO {
  applicationId: string;
  vacancyId: string;
  vacancyTitle: string;
  company: string;
  /** Собеседник глазами смотрящего: студент видит компанию, компания — студента */
  counterpartName: string;
  counterpartPhotoUrl: string | null;
  counterpartSubtitle: string;
  status: ApplicationStatus;
  lastMessageBody: string | null;
  lastMessageAuthor: MessageAuthor | null;
  lastMessageAt: string | null;
  unread: number;
  /** Может ли смотрящий писать прямо сейчас */
  canWrite: boolean;
  /** Почему нельзя — текстом для интерфейса, не кодом ошибки */
  lockedReason: string | null;
}

export interface ThreadDTO extends ThreadSummaryDTO {
  messages: MessageDTO[];
}

/** Максимальная длина сообщения. Длиннее — это уже письмо, а не реплика. */
export const MESSAGE_MAX_LENGTH = 2000;
