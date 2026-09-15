import type { StudyStatus } from '@/lib/study';
import type { StaffPermission } from '@/lib/staff-permissions';

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

export const MODERATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];
export const MODERATION_STATUS_LABEL: Record<ModerationStatus, string> = {
  PENDING: 'На модерации',
  APPROVED: 'Одобрено',
  REJECTED: 'Отклонено',
};

/**
 * Путь вакансии из кабинета компании: черновик → на проверке →
 * опубликована, отклонена или снята. Вакансии из CRM приходят сразу
 * опубликованными — их проверило агентство.
 */
export const VACANCY_STATUSES = ['DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'CLOSED'] as const;
export type VacancyStatus = (typeof VACANCY_STATUSES)[number];
export const VACANCY_STATUS_LABEL: Record<VacancyStatus, string> = {
  DRAFT: 'Черновик',
  PENDING: 'На проверке',
  PUBLISHED: 'Опубликована',
  REJECTED: 'Отклонена',
  CLOSED: 'Снята',
};

/**
 * Страница компании — то, что студент видит о работодателе помимо вакансии.
 *
 * Карточка на доске Miro: название, логотип, отрасль, «о компании»,
 * сайт и соцсети, фото и видео, что важно в культуре и команде.
 */
export interface CompanyProfile {
  companyName: string;
  contactName: string;
  logoUrl: string | null;
  industry: string | null;
  about: string | null;
  culture: string | null;
  website: string | null;
  city: string | null;
  socials: LinkItem[];
  photos: string[];
  videoUrl: string | null;
}

/** Публичная страница компании. Контактного лица здесь нет — это ПДн. */
export interface CompanyPublicDTO extends Omit<CompanyProfile, 'contactName'> {
  id: string;
  activeVacancies: number;
  /** Открытые вакансии — только те, что видит студент */
  vacancies: Array<{ id: string; title: string; city: string; employmentType: EmploymentType }>;
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

export const SALARY_PERIODS = ['MONTH', 'SHIFT', 'HOUR'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const SALARY_PERIOD_LABEL: Record<SalaryPeriod, string> = {
  MONTH: 'в месяц',
  SHIFT: 'за смену',
  HOUR: 'в час',
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
  /**
   * Для ссылки на страницу компании. null — у вакансий витрины на главной:
   * это демо-выгрузка без записи компании в базе, и ссылке вести некуда.
   */
  companyId: string | null;
  companyLogoUrl: string | null;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  perks: string[];
  /** Чему научится студент — карточка вакансии v0.1 с доски Miro */
  learnings: string[];
  /** С кем предстоит работать: команда, наставник, руководитель */
  team: string | null;
  photos: string[];
  videoUrl: string | null;
  salaryFrom: number | null;
  salaryTo: number | null;
  salaryPeriod: 'MONTH' | 'SHIFT' | 'HOUR';
  city: string;
  district: string | null;
  /** Улица и дом; null у удалённой вакансии */
  address: string | null;
  /** Офис, этаж, вход */
  addressDetails: string | null;
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
  /** Полных лет */
  age: number;
  /** «ГГГГ-ММ-ДД» — только самому студенту, остальным null */
  birthDate: string | null;
  photoUrl: string | null;
  resumeUrl: string | null;
  resumeName: string | null;
  university: string;
  speciality: string;
  studyYear: number;
  /** Вуз из справочника; null — вписан вручную */
  institutionId: string | null;
  /** Учёбу подтвердил HR агентства */
  studyVerified: boolean;
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
  /** Разделы панели HR у сотрудника из CRM; нет — учётке открыто всё */
  permissions?: StaffPermission[];
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
  /** Ждут решения HR: компании, зарегистрированные сами, и вакансии из кабинетов */
  moderation: { companies: number; vacancies: number };
  /** Студенты по учреждениям. id null — вуз вписан вручную, не из справочника */
  institutions: Array<{ id: string | null; name: string; students: number; verified: number }>;
}

/** Вакансия в кабинете компании — все статусы, с числом откликов. */
export interface EmployerVacancyDTO {
  id: string;
  title: string;
  status: VacancyStatus;
  /** Вакансию из CRM кабинет не меняет — её ведёт агентство */
  fromCrm: boolean;
  /** Причина отказа — только у отклонённой */
  moderationNote: string | null;
  applications: number;
  city: string;
  employmentType: EmploymentType;
  updatedAt: string;
}

/** Компания в очереди модерации. Почту видит только HR. */
export interface ModerationCompanyDTO {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  /** ИНН для сверки с госреестром; пуст у клиентов из CRM */
  inn: string | null;
  /** Телефон контактного лица — позвонить, если в открытых источниках пусто */
  phone: string | null;
  /** Почта на публичном сервисе, а не на домене компании */
  freeEmail: boolean;
  logoUrl: string | null;
  industry: string | null;
  city: string | null;
  about: string | null;
  website: string | null;
  createdAt: string;
  pendingVacancies: number;
}

/** Вакансия в очереди модерации — в том виде, в каком её увидит студент. */
export interface ModerationVacancyDTO {
  companyId: string;
  companyStatus: ModerationStatus;
  submittedAt: string;
  /** Версия, которую видит HR: решение по устаревшей версии сервер отклонит */
  version: string;
  vacancy: VacancyDTO;
}

/**
 * События пилота — шаги пути с доски Miro: регистрация, заполненный профиль,
 * публикация вакансии, отклик, просмотр профиля, следующий шаг.
 */
export const EVENT_TYPES = [
  'student.registered',
  'student.profile.completed',
  'company.registered',
  'company.approved',
  'vacancy.published',
  'application.created',
  'profile.viewed',
  'application.next_step',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_LABEL: Record<EventType, string> = {
  'student.registered': 'Студент зарегистрировался',
  'student.profile.completed': 'Студент заполнил профиль',
  'company.registered': 'Компания зарегистрировалась',
  'company.approved': 'Компания одобрена',
  'vacancy.published': 'Вакансия опубликована',
  'application.created': 'Отклик на вакансию',
  'profile.viewed': 'Работодатель открыл профиль',
  'application.next_step': 'Следующий шаг по отклику',
};

/** Метрики пилота для панели HR. Длительности — медианы. */
export interface PilotMetricsDTO {
  students: { registered: number; completedProfile: number; applied: number; gotOpportunity: number; verified: number };
  companies: { total: number; selfRegistered: number; approved: number; withPublishedVacancy: number };
  vacancies: { published: number; fromCabinet: number };
  applications: { total: number; viewed: number; nextStep: number; hired: number };
  profileViews: number;
  timing: { firstApplicationHours: number | null; firstOpportunityDays: number | null };
  events: Array<{ id: string; type: string; label: string; subject: string | null; createdAt: string }>;
}

/** Вуз в подсказках при вводе. */
export interface InstitutionOption {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  city: string;
}

/** Публичная страница учебного заведения. */
export interface InstitutionPublicDTO extends InstitutionOption {
  description: string | null;
  directions: string[];
  website: string | null;
}

/** Студент в панели HR. */
export interface AdminStudentDTO {
  id: string;
  fullName: string;
  photoUrl: string | null;
  university: string;
  institutionId: string | null;
  speciality: string;
  studyYear: number;
  city: string | null;
  status: StudentStatus;
  studyVerified: boolean;
  /** Подтверждена, справка на проверке, возвращена или ничего нет */
  study: StudyStatus;
  studyDocUrl: string | null;
  studyDocName: string | null;
  studyDocAt: string | null;
  studyReviewNote: string | null;
  applications: number;
  createdAt: string;
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

// ============ ПОДТВЕРЖДЕНИЕ УЧЁБЫ ============

export type { StudyStatus };

/** Состояние подтверждения учёбы — для профиля, ленты и откликов студента. */
export interface StudyStateDTO {
  status: StudyStatus;
  docName: string | null;
  docAt: string | null;
  /** Причина, по которой HR вернул справку */
  note: string | null;
  /** Срок загрузки справки — четыре рабочих дня от регистрации */
  deadline: string;
  workdaysLeft: number;
  deadlinePassed: boolean;
}

/** Отклик, который ждёт подтверждения учёбы: свайп вправо без отклика. */
export interface PendingApplicationDTO {
  vacancy: VacancyDTO;
  swipedAt: string;
  /** Когда удалится, если учёбу не подтвердят */
  expiresAt: string;
}
