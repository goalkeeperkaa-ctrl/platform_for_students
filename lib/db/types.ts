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
  VacancyStatus,
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
  termsVersion: string | null;
  termsAcceptedAt: Date | null;
  marketingConsentAt: Date | null;
  tourSeenAt: Date | null;
  /** Почта подтверждена кодом из письма или переходом по ссылке сброса пароля */
  emailVerifiedAt: Date | null;
  /** Напоминания и сводки о сообщениях; письма о решениях приходят всегда */
  notifyEmail: boolean;
  createdAt: Date;
}

export interface StudentRecord extends StudentPortfolio {
  id: string;
  accountId: string;
  fullNameEnc: string;
  phoneEnc: string | null;
  gender: Gender;
  birthYear: number;
  /** «ГГГГ-ММ-ДД», зашифрована. null — анкета заведена до полной даты */
  birthDateEnc: string | null;
  photoUrl: string | null;
  resumeUrl: string | null;
  resumeName: string | null;
  university: string;
  speciality: string;
  studyYear: number;
  institutionId: string | null;
  studyVerified: boolean;
  studyVerifiedAt: Date | null;
  /** Справка на проверке у HR; null — не загружена или уже проверена */
  studyDocUrl: string | null;
  studyDocName: string | null;
  studyDocAt: Date | null;
  /** Причина, по которой HR вернул справку */
  studyReviewNote: string | null;
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

export interface InstitutionRecord {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  city: string;
  description: string | null;
  directions: string[];
  website: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmployerRecord {
  id: string;
  accountId: string;
  companyName: string;
  contactName: string;
  /** Телефон контактного лица, зашифрован */
  phoneEnc: string | null;
  /** ИНН; пуст у клиентов из CRM */
  inn: string | null;
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
  learnings: string[];
  team: string | null;
  photos: string[];
  videoUrl: string | null;
  salaryFrom: number | null;
  salaryTo: number | null;
  salaryPeriod: SalaryPeriod;
  city: string;
  district: string | null;
  address: string | null;
  addressDetails: string | null;
  workFormat: WorkFormat;
  employmentType: EmploymentType;
  shiftDays: Weekday[];
  hoursPerWeek: number | null;
  tags: string[];
  isHot: boolean;
  isActive: boolean;
  status: VacancyStatus;
  moderationNote: string | null;
  submittedAt: Date | null;
  moderatedAt: Date | null;
  /** Последняя одобренная агентством версия содержимого; null — не одобрялась */
  approvedContent: VacancyContent | null;
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

export type AuthTokenKind = 'EMAIL_VERIFY' | 'PASSWORD_RESET';

/** Код подтверждения почты или ссылка сброса пароля. Только хеш, сам код не хранится. */
export interface AuthTokenRecord {
  id: string;
  accountId: string;
  kind: AuthTokenKind;
  tokenHash: string;
  attempts: number;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
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

/** Событие пилота. Только идентификаторы — без ПДн. */
export interface EventRecord {
  id: string;
  type: string;
  studentId: string | null;
  employerId: string | null;
  vacancyId: string | null;
  applicationId: string | null;
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
  /** «ГГГГ-ММ-ДД» открытым текстом — хранилище шифрует */
  birthDate: string;
  photoUrl: string | null;
  resumeUrl: string | null;
  resumeName: string | null;
  university: string;
  speciality: string;
  studyYear: number;
  institutionId: string | null;
  /** false — снять подтверждение учёбы: сменился вуз. undefined — не трогать */
  studyVerified?: boolean;
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
  /** «ГГГГ-ММ-ДД» открытым текстом — хранилище шифрует */
  birthDate: string;
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
  institutionId: string | null;
  consentVersion: string;
  consentIp: string | null;
  termsVersion: string;
  marketingConsent: boolean;
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
  inn: string;
  /** Открытым текстом — хранилище шифрует */
  phone: string;
  consentVersion: string;
  termsVersion: string;
  marketingConsent: boolean;
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
  /** Телефон контактного лица открытым текстом; undefined — не менять */
  phone?: string | null;
  /** ИНН; undefined — не менять */
  inn?: string;
}

/**
 * Содержимое вакансии из кабинета компании — ровно то, что проверяет форма.
 * Статус и даты выставляет сервер.
 */
export type VacancyContent = Pick<
  VacancyRecord,
  | 'title'
  | 'summary'
  | 'responsibilities'
  | 'requirements'
  | 'perks'
  | 'learnings'
  | 'team'
  | 'salaryFrom'
  | 'salaryTo'
  | 'salaryPeriod'
  | 'city'
  | 'district'
  | 'address'
  | 'addressDetails'
  | 'workFormat'
  | 'employmentType'
  | 'shiftDays'
  | 'hoursPerWeek'
  | 'tags'
  | 'photos'
  | 'videoUrl'
>;

export interface NewVacancyInput extends VacancyContent {
  employerId: string;
  status: VacancyStatus;
  isActive: boolean;
  submittedAt: Date | null;
}

export type VacancyPatch = Partial<VacancyContent> &
  Partial<
    Pick<
      VacancyRecord,
      'status' | 'isActive' | 'moderationNote' | 'submittedAt' | 'moderatedAt' | 'publishedAt' | 'approvedContent'
    >
  >;

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
  address: string | null;
  addressDetails: string | null;
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
    /** Инструкция по кабинету пройдена или закрыта */
    markTourSeen(id: string): Promise<void>;
    /** Повторная отметка не сдвигает дату первого подтверждения */
    markEmailVerified(id: string): Promise<void>;
    setPassword(id: string, passwordHash: string): Promise<void>;
    setNotifyEmail(id: string, enabled: boolean): Promise<void>;
    /** Сотрудник агентства при первом входе из CRM: без пароля, почта подтверждена CRM */
    createStaff(email: string): Promise<AccountRecord>;
  };

  authTokens: {
    /** Новый код отменяет прежние неиспользованные того же вида: действует последнее письмо */
    issue(input: { accountId: string; kind: AuthTokenKind; tokenHash: string; expiresAt: Date }): Promise<AuthTokenRecord>;
    /** Последний неиспользованный — для проверки кода и паузы между письмами */
    latest(accountId: string, kind: AuthTokenKind): Promise<AuthTokenRecord | null>;
    findActiveByHash(kind: AuthTokenKind, tokenHash: string): Promise<AuthTokenRecord | null>;
    /** Неверный ввод; возвращает, сколько ошибок уже накопилось */
    recordFailure(id: string): Promise<number>;
    /** Погасить. false — его уже погасил параллельный запрос */
    consume(id: string): Promise<boolean>;
  };

  notifications: {
    /** Отметить письмо отправленным. false — такое уже уходило, второй раз не шлём */
    claim(accountId: string, key: string): Promise<boolean>;
  };

  staffTickets: {
    /** Погасить билет входа из CRM. false — по нему уже входили */
    consume(jti: string): Promise<boolean>;
  };

  students: {
    createWithAccount(input: NewStudentInput): Promise<{ account: AccountRecord; student: StudentRecord }>;
    findByAccountId(accountId: string): Promise<StudentRecord | null>;
    findById(id: string): Promise<StudentRecord | null>;
    list(): Promise<StudentRecord[]>;
    setStatus(id: string, status: StudentStatus): Promise<void>;
    /** Отметка HR «учёба подтверждена». null — студента нет. */
    setStudyVerified(id: string, verified: boolean): Promise<StudentRecord | null>;
    /** Справка на проверку; null — отозвать. Новая справка снимает причину прошлого отказа. */
    setStudyDocument(id: string, doc: { url: string; name: string } | null): Promise<StudentRecord | null>;
    /** HR вернул справку: файл снимается, причина остаётся студенту. */
    rejectStudy(id: string, note: string): Promise<StudentRecord | null>;
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

  institutions: {
    list(): Promise<InstitutionRecord[]>;
    findById(id: string): Promise<InstitutionRecord | null>;
    findBySlug(slug: string): Promise<InstitutionRecord | null>;
  };

  employers: {
    findByAccountId(accountId: string): Promise<EmployerRecord | null>;
    findById(id: string): Promise<EmployerRecord | null>;
    /** Для проверки ИНН до отправки кода регистрации — без этого письмо ушло бы впустую. */
    findByInn(inn: string): Promise<EmployerRecord | null>;
    list(): Promise<EmployerRecord[]>;
    createWithAccount(input: NewEmployerInput): Promise<{ account: AccountRecord; employer: EmployerRecord }>;
    updateProfile(id: string, input: CompanyProfileUpdate): Promise<EmployerRecord>;
    /** Решение модерации. PENDING — вернуть на повторную проверку. */
    setModeration(id: string, input: { status: ModerationStatus; note: string | null }): Promise<EmployerRecord>;
    /**
     * Компания клиента CRM — заводится по первому входу так же, как и по
     * первой вакансии из синка (crmClientId уникален и общий для обоих
     * путей). Повторный вход ничего не перезаписывает: имя и контакт ведёт
     * синк из CRM, а не то, кто из сотрудников клиента зашёл сейчас.
     */
    ensureForCrmClient(input: {
      crmClientId: string;
      companyName: string;
      contactName: string;
      contactEmail: string;
    }): Promise<EmployerRecord>;
  };

  vacancies: {
    /**
     * Видимые студенту: опубликованные, не снятые, у одобренной компании.
     * Правило то же, что в isVacancyVisible (lib/vacancy.ts).
     */
    listActive(): Promise<VacancyRecord[]>;
    findById(id: string): Promise<VacancyRecord | null>;
    findManyByIds(ids: string[]): Promise<VacancyRecord[]>;
    listByEmployer(employerId: string): Promise<VacancyRecord[]>;
    listByStatus(status: VacancyStatus): Promise<VacancyRecord[]>;
    /**
     * Вакансии, среди фото которых этот файл, — для раздачи картинок.
     * Все, а не первая: одно фото компания может поставить в несколько
     * вакансий, и черновик не должен прятать фото опубликованной.
     */
    listByPhoto(url: string): Promise<VacancyRecord[]>;
    /** Вакансии с этим видео — для раздачи файла по тому же принципу, что и фото. */
    listByVideo(url: string): Promise<VacancyRecord[]>;
    create(input: NewVacancyInput): Promise<VacancyRecord>;
    update(id: string, patch: VacancyPatch): Promise<VacancyRecord>;
    /** active — видимые студенту, total — все в базе */
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
    /** Непрочитанные, написанные раньше момента, — для сводки на почту */
    listUnreadBefore(before: Date): Promise<MessageRecord[]>;
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

  events: {
    log(entry: Omit<EventRecord, 'id' | 'createdAt'>): Promise<void>;
    /** Новые первыми. types — только эти события */
    list(filter: { types?: string[]; limit: number }): Promise<EventRecord[]>;
    /** Сколько событий каждого типа — без выборки самих событий */
    countByType(types: string[]): Promise<Record<string, number>>;
  };
}
