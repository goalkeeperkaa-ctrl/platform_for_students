import type {
  ApplicationStatus,
  EmploymentType,
  Gender,
  LinkItem,
  LookingFor,
  MessageAuthor,
  ModerationStatus,
  Role,
  StudentPortfolio,
  StudentStatus,
  SwipeDirection,
  SyncStatus,
  Weekday,
  WorkFormat,
} from '@/lib/types';

/**
 * Сырые записи хранилища — ровно то, что лежит в БД, с зашифрованными
 * полями как есть. Расшифровка живёт в mappers.ts и происходит на границе
 * с интерфейсом, а не внутри хранилища: так невозможно случайно отдать
 * ПДн наружу, забыв про фильтр по роли.
 */

export interface AccountRecord {
  id: string;
  role: Role;
  emailEnc: string;
  emailHash: string;
  passwordHash: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface StudentRecord extends StudentPortfolio {
  id: string;
  accountId: string;
  fullNameEnc: string;
  phoneEnc: string | null;
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
  consentVersion: string;
  consentAt: Date;
  consentIp: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmployerRecord {
  id: string;
  accountId: string;
  companyName: string;
  contactName: string;
  logoUrl: string | null;
  crmClientId: string | null;
  industry: string | null;
  about: string | null;
  culture: string | null;
  website: string | null;
  city: string | null;
  socials: LinkItem[];
  photos: string[];
  videoUrl: string | null;
  moderationStatus: ModerationStatus;
  moderationNote: string | null;
  moderatedAt: Date | null;
  consentVersion: string | null;
  consentAt: Date | null;
  createdAt: Date;
}

export type SalaryPeriod = 'MONTH' | 'SHIFT' | 'HOUR';

export interface VacancyRecord {
  id: string;
  crmId: string | null;
  employerId: string;
  title: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  perks: string[];
  salaryFrom: number | null;
  salaryTo: number | null;
  salaryPeriod: SalaryPeriod;
  city: string;
  district: string | null;
  workFormat: WorkFormat;
  employmentType: EmploymentType;
  shiftDays: Weekday[];
  hoursPerWeek: number | null;
  tags: string[];
  isHot: boolean;
  isActive: boolean;
  publishedAt: Date;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SwipeRecord {
  id: string;
  studentId: string;
  vacancyId: string;
  direction: SwipeDirection;
  createdAt: Date;
}

export interface ApplicationRecord {
  id: string;
  studentId: string;
  vacancyId: string;
  status: ApplicationStatus;
  employerNote: string | null;
  statusChangedAt: Date;
  createdAt: Date;
  /** Денормализовано ради сортировки списка диалогов одним запросом */
  lastMessageAt: Date | null;
}

export interface MessageRecord {
  id: string;
  applicationId: string;
  author: MessageAuthor;
  /** AES-256-GCM: личная переписка — те же ПДн, что ФИО и телефон */
  bodyEnc: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface AccessCodeRecord {
  id: string;
  accountId: string;
  codeHash: string;
  label: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface SyncRunRecord {
  id: string;
  source: string;
  status: SyncStatus;
  startedAt: Date;
  finishedAt: Date | null;
  created: number;
  updated: number;
  deactivated: number;
  error: string | null;
}

export interface AuditRecord {
  id: string;
  accountId: string | null;
  actorLabel: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  meta: Record<string, unknown> | null;
  createdAt: Date;
}

// ============ Входные данные ============

/**
 * Что студент может менять в своём профиле.
 *
 * Почты и пароля здесь нет намеренно. Почта — это удостоверение: сменить
 * её без подтверждения нового адреса значит позволить увести учётную
 * запись. Пароль меняют отдельным действием, а не заодно с городом.
 *
 * Согласия на ПДн тоже нет: это юридический факт с датой и версией,
 * а не поле анкеты. Передумал — удаляй профиль.
 *
 * Портфолио — частично: не переданное поле не меняется, а не стирается.
 */
export interface StudentProfileUpdate extends Partial<StudentPortfolio> {
  fullName: string;
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
}

export interface NewStudentInput {
  email: string;
  password: string;
  fullName: string;
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
  lookingFor: LookingFor[];
  consentVersion: string;
  consentIp: string | null;
}

/**
 * Самостоятельная регистрация компании.
 *
 * Компания сразу получает кабинет, но студентам не видна, пока её не
 * одобрит HR агентства: статус выставляет хранилище, а не форма, — иначе
 * подменённое поле в запросе публиковало бы компанию в обход проверки.
 */
export interface NewEmployerInput {
  email: string;
  password: string;
  companyName: string;
  contactName: string;
  industry: string | null;
  city: string | null;
  consentVersion: string;
}

/** Страница компании: всё, что компания меняет о себе сама. */
export interface CompanyProfileUpdate {
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

/** Форма вакансии, приходящая из CRM. crmId — ключ сопоставления. */
export interface CrmVacancyInput {
  crmId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  crmClientId: string;
  title: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  perks: string[];
  salaryFrom: number | null;
  salaryTo: number | null;
  salaryPeriod: SalaryPeriod;
  city: string;
  district: string | null;
  workFormat: WorkFormat;
  employmentType: EmploymentType;
  shiftDays: Weekday[];
  hoursPerWeek: number | null;
  tags: string[];
  isHot: boolean;
  isActive: boolean;
  publishedAt: Date;
}

export interface SyncOutcome {
  created: number;
  updated: number;
  deactivated: number;
}

/**
 * Контракт хранилища. Две реализации: Prisma поверх PostgreSQL и
 * демонстрационная в памяти процесса — она позволяет запустить и
 * посмотреть продукт без поднятой инфраструктуры.
 */
export interface DataStore {
  readonly kind: 'prisma' | 'memory';

  accounts: {
    findByEmailHash(emailHash: string): Promise<AccountRecord | null>;
    findById(id: string): Promise<AccountRecord | null>;
    touchLogin(id: string): Promise<void>;
  };

  students: {
    createWithAccount(input: NewStudentInput): Promise<{ account: AccountRecord; student: StudentRecord }>;
    findByAccountId(accountId: string): Promise<StudentRecord | null>;
    findById(id: string): Promise<StudentRecord | null>;
    list(): Promise<StudentRecord[]>;
    setStatus(id: string, status: StudentStatus): Promise<void>;
    update(id: string, input: StudentProfileUpdate): Promise<StudentRecord>;
    /**
     * Удаление по требованию человека (152-ФЗ, право на отзыв согласия).
     *
     * Удаляется учётная запись, а не анкета: каскады уносят анкету,
     * свайпы, отклики и переписку разом. Оставить учётку значило бы
     * оставить почту — то есть персональные данные, ради удаления
     * которых всё и затевалось.
     *
     * Журнал аудита переживает удаление: ссылка на аккаунт обнуляется,
     * а подпись актора в записи остаётся. Журнал, теряющий записи
     * вместе с тем, о ком они, перестаёт быть журналом.
     */
    deleteByAccountId(accountId: string): Promise<void>;
  };

  employers: {
    findByAccountId(accountId: string): Promise<EmployerRecord | null>;
    findById(id: string): Promise<EmployerRecord | null>;
    list(): Promise<EmployerRecord[]>;
    createWithAccount(input: NewEmployerInput): Promise<{ account: AccountRecord; employer: EmployerRecord }>;
    updateProfile(id: string, input: CompanyProfileUpdate): Promise<EmployerRecord>;
  };

  vacancies: {
    listActive(): Promise<VacancyRecord[]>;
    findById(id: string): Promise<VacancyRecord | null>;
    findManyByIds(ids: string[]): Promise<VacancyRecord[]>;
    listByEmployer(employerId: string): Promise<VacancyRecord[]>;
    countAll(): Promise<{ active: number; total: number }>;
    syncFromCrm(items: CrmVacancyInput[]): Promise<SyncOutcome>;
  };

  swipes: {
    create(input: { studentId: string; vacancyId: string; direction: SwipeDirection }): Promise<SwipeRecord>;
    listByStudent(studentId: string, direction?: SwipeDirection): Promise<SwipeRecord[]>;
    remove(studentId: string, vacancyId: string): Promise<void>;
    swipedVacancyIds(studentId: string): Promise<string[]>;
    countByDirection(): Promise<{ right: number; left: number }>;
  };

  applications: {
    upsert(input: { studentId: string; vacancyId: string }): Promise<ApplicationRecord>;
    listByStudent(studentId: string): Promise<ApplicationRecord[]>;
    listByVacancyIds(vacancyIds: string[]): Promise<ApplicationRecord[]>;
    listAll(): Promise<ApplicationRecord[]>;
    findById(id: string): Promise<ApplicationRecord | null>;
    setStatus(id: string, status: ApplicationStatus, note?: string | null): Promise<ApplicationRecord | null>;
    removeByPair(studentId: string, vacancyId: string): Promise<void>;
  };

  messages: {
    listByApplication(applicationId: string): Promise<MessageRecord[]>;
    create(input: { applicationId: string; author: MessageAuthor; body: string }): Promise<MessageRecord>;
    /** Помечает прочитанными сообщения ПРОТИВОПОЛОЖНОЙ стороны. Возвращает сколько. */
    markRead(applicationId: string, reader: MessageAuthor): Promise<number>;
    /** Непрочитанное для читателя по каждому отклику — одним запросом на список */
    unreadFor(applicationIds: string[], reader: MessageAuthor): Promise<Record<string, number>>;
    lastFor(applicationIds: string[]): Promise<Record<string, MessageRecord>>;
  };

  accessCodes: {
    findByHash(codeHash: string): Promise<AccessCodeRecord | null>;
    markUsed(id: string): Promise<void>;
    /**
     * Выдать код работодателю. Наружу отдаётся только хеш — сам код
     * существует ровно один раз, в момент выдачи, и восстановить его
     * из базы нельзя. Потерян — выпускается новый.
     */
    issue(input: { accountId: string; codeHash: string; label: string; expiresAt: Date | null }): Promise<AccessCodeRecord>;
  };

  syncRuns: {
    start(source: string): Promise<SyncRunRecord>;
    finish(id: string, patch: Partial<Pick<SyncRunRecord, 'status' | 'created' | 'updated' | 'deactivated' | 'error'>>): Promise<SyncRunRecord | null>;
    latest(): Promise<SyncRunRecord | null>;
    list(limit: number): Promise<SyncRunRecord[]>;
  };

  audit: {
    log(entry: Omit<AuditRecord, 'id' | 'createdAt'>): Promise<void>;
    list(limit: number): Promise<AuditRecord[]>;
  };
}
