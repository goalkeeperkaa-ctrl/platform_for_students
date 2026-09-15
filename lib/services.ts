import 'server-only';
import { getStore } from '@/lib/db';
import { scoreMatch, studentName, toStudentDTO, toVacancyDTO } from '@/lib/db/mappers';
import { decryptSafe } from '@/lib/security/crypto';
import type { EmployerRecord, InstitutionRecord, StudentRecord, SwipeRecord, VacancyRecord } from '@/lib/db/types';
import { isVacancyVisible, studentFacingVacancy, type CompanyAddress } from '@/lib/vacancy';
import { NEXT_STEP_STATUSES, track } from '@/lib/analytics';
import { COMPLETE_PROFILE_PERCENT, profileCompleteness } from '@/lib/portfolio';
import { isFreeEmail } from '@/lib/company';
import { PILOT_CITY } from '@/lib/pilot';
import { rankInstitutions, type RatingRow } from '@/lib/rating';
import { applicationsOpen, isPendingExpired, pendingExpiresAt, studyDocDeadline, studyStatus, workdaysLeft } from '@/lib/study';
import {
  APPLICATION_STATUSES,
  EVENT_LABEL,
  STUDENT_STATUSES,
  type AdminStats,
  type EventType,
  type PilotMetricsDTO,
  type AdminStudentDTO,
  type InstitutionOption,
  type InstitutionPublicDTO,
  type ApplicationDTO,
  type ApplicationStatus,
  type AuditEntryDTO,
  type EmployerApplicationDTO,
  type EmployerVacancyDTO,
  type ModerationCompanyDTO,
  type ModerationVacancyDTO,
  type SkippedDTO,
  type StudentStatus,
  type SyncRunDTO,
  type VacancyDTO,
  type PendingApplicationDTO,
  type StudyStateDTO,
} from '@/lib/types';

/**
 * Чтение доменных данных.
 *
 * Один слой на серверные компоненты и на API-роуты: страница отрисовывает
 * то же, что вернёт fetch после свайпа. Иначе первый рендер и обновление
 * начинают расходиться в мелочах, и это ловится только глазами.
 */

async function employerIndex(): Promise<Map<string, EmployerRecord>> {
  const store = await getStore();
  const employers = await store.employers.list();
  return new Map(employers.map((e) => [e.id, e]));
}

/**
 * Лента для свайпов.
 *
 * Уже отсвайпанное не показывается: повторный показ карточки читается как
 * потеря решения. Сортировка — по совпадению, но не строго: пять лучших
 * вакансий подряд от одного работодателя выглядят как сбой, поэтому
 * одинаковые компании разводятся по ленте.
 */
import type { CompanyPublicDTO } from '@/lib/types';

export async function buildFeed(studentId: string, limit = 30): Promise<VacancyDTO[]> {
  // Просроченные ожидающие отклики удаляются до сборки ленты: вакансия
  // возвращается студенту, а не пропадает вместе с неотправленным откликом
  await expirePendingSwipes(studentId);
  const store = await getStore();
  const [student, vacancies, swipedIds, employers] = await Promise.all([
    store.students.findById(studentId),
    store.vacancies.listActive(),
    store.swipes.swipedVacancyIds(studentId),
    employerIndex(),
  ]);

  const seen = new Set(swipedIds);
  const scored = vacancies
    .filter((v) => !seen.has(v.id))
    .map((vacancy) => ({ vacancy, match: scoreMatch(student, vacancy) }))
    .sort((a, b) => b.match.score - a.match.score || +b.vacancy.publishedAt - +a.vacancy.publishedAt);

  return spreadByCompany(scored, employers)
    .slice(0, limit)
    .map(({ vacancy, match }) => toVacancyDTO(vacancy, employers.get(vacancy.employerId) ?? null, match));
}

/** Раскладывает подряд идущие вакансии одной компании по ленте. */
function spreadByCompany<T extends { vacancy: VacancyRecord }>(
  items: T[],
  employers: Map<string, EmployerRecord>,
): T[] {
  const out: T[] = [];
  const deferred: T[] = [];
  let lastEmployer = '';

  for (const item of items) {
    if (item.vacancy.employerId === lastEmployer) {
      deferred.push(item);
      continue;
    }
    out.push(item);
    lastEmployer = item.vacancy.employerId;

    const idx = deferred.findIndex((d) => d.vacancy.employerId !== lastEmployer);
    if (idx >= 0) {
      const [next] = deferred.splice(idx, 1);
      out.push(next);
      lastEmployer = next.vacancy.employerId;
    }
  }
  // Остаток всё равно нужно показать — лучше подряд, чем не показать вовсе
  void employers;
  return [...out, ...deferred];
}

export async function listApplications(studentId: string): Promise<ApplicationDTO[]> {
  const store = await getStore();
  const applications = await store.applications.listByStudent(studentId);
  if (applications.length === 0) return [];

  const [vacancies, employers, student] = await Promise.all([
    store.vacancies.findManyByIds(applications.map((a) => a.vacancyId)),
    employerIndex(),
    store.students.findById(studentId),
  ]);
  const byId = new Map(vacancies.map((v) => [v.id, v]));
  // Скрытая вакансия — в последней одобренной версии: правка компании до
  // проверки агентством к студенту не попадает
  const facing = (vacancy: VacancyRecord) => {
    const employer = employers.get(vacancy.employerId) ?? null;
    const shown = studentFacingVacancy(vacancy, employer);
    return toVacancyDTO(shown, employer, scoreMatch(student, shown));
  };

  return applications.flatMap((application) => {
    const vacancy = byId.get(application.vacancyId);
    if (!vacancy) return [];
    return [
      {
        id: application.id,
        status: application.status,
        createdAt: application.createdAt.toISOString(),
        statusChangedAt: application.statusChangedAt.toISOString(),
        employerNote: application.employerNote,
        vacancy: facing(vacancy),
      } satisfies ApplicationDTO,
    ];
  });
}

export async function listSkipped(studentId: string): Promise<SkippedDTO[]> {
  const store = await getStore();
  const swipes = await store.swipes.listByStudent(studentId, 'LEFT');
  if (swipes.length === 0) return [];

  const [vacancies, employers, student] = await Promise.all([
    store.vacancies.findManyByIds(swipes.map((s) => s.vacancyId)),
    employerIndex(),
    store.students.findById(studentId),
  ]);
  const byId = new Map(vacancies.map((v) => [v.id, v]));
  const facing = (vacancy: VacancyRecord) => {
    const employer = employers.get(vacancy.employerId) ?? null;
    const shown = studentFacingVacancy(vacancy, employer);
    return toVacancyDTO(shown, employer, scoreMatch(student, shown));
  };

  return swipes.flatMap((swipe) => {
    const vacancy = byId.get(swipe.vacancyId);
    if (!vacancy) return [];
    return [
      {
        id: swipe.id,
        createdAt: swipe.createdAt.toISOString(),
        vacancy: facing(vacancy),
      } satisfies SkippedDTO,
    ];
  });
}

export interface EmployerBoard {
  company: string;
  vacancies: Array<{ id: string; title: string; isActive: boolean; total: number }>;
  applications: EmployerApplicationDTO[];
}

/**
 * Кабинет работодателя.
 *
 * Контакты студента раскрываются здесь и только здесь: человек сам
 * откликнулся на вакансию этой компании — это и есть основание передать
 * телефон и резюме.
 */
export async function buildEmployerBoard(employerId: string): Promise<EmployerBoard> {
  const store = await getStore();
  const employer = await store.employers.findById(employerId);
  const vacancies = await store.vacancies.listByEmployer(employerId);
  const applications = await store.applications.listByVacancyIds(vacancies.map((v) => v.id));

  const students = new Map<string, StudentRecord>();
  const emails = new Map<string, string>();
  for (const application of applications) {
    if (students.has(application.studentId)) continue;
    const student = await store.students.findById(application.studentId);
    if (!student) continue;
    students.set(student.id, student);
    const account = await store.accounts.findById(student.accountId);
    emails.set(student.id, account ? decryptSafe(account.emailEnc) : '');
  }

  const vacancyById = new Map(vacancies.map((v) => [v.id, v]));
  const items: EmployerApplicationDTO[] = applications.flatMap((application) => {
    const student = students.get(application.studentId);
    const vacancy = vacancyById.get(application.vacancyId);
    if (!student || !vacancy) return [];
    return [
      {
        id: application.id,
        status: application.status,
        createdAt: application.createdAt.toISOString(),
        statusChangedAt: application.statusChangedAt.toISOString(),
        employerNote: application.employerNote,
        vacancyId: vacancy.id,
        vacancyTitle: vacancy.title,
        student: toStudentDTO(student, emails.get(student.id) ?? '', { includeContacts: true }),
      },
    ];
  });

  return {
    company: employer?.companyName ?? 'Работодатель',
    // Черновик откликов не собирает — в фильтре откликов ему не место
    vacancies: vacancies
      .filter((v) => v.status !== 'DRAFT')
      .map((v) => ({
        id: v.id,
        title: v.title,
        isActive: v.isActive,
        total: items.filter((i) => i.vacancyId === v.id).length,
      })),
    applications: items,
  };
}

export async function buildAdminStats(): Promise<AdminStats> {
  const store = await getStore();
  const [students, applications, swipes, vacancyCounts, employers, lastSync, pendingVacancies, schools] =
    await Promise.all([
      store.students.list(),
      store.applications.listAll(),
      store.swipes.countByDirection(),
      store.vacancies.countAll(),
      employerIndex(),
      store.syncRuns.latest(),
      store.vacancies.listByStatus('PENDING'),
      store.institutions.list(),
    ]);

  const byStudentStatus = Object.fromEntries(
    STUDENT_STATUSES.map((s) => [s, 0]),
  ) as Record<StudentStatus, number>;
  for (const s of students) byStudentStatus[s.status]++;

  const byApplicationStatus = Object.fromEntries(
    APPLICATION_STATUSES.map((s) => [s, 0]),
  ) as Record<ApplicationStatus, number>;
  for (const a of applications) byApplicationStatus[a.status]++;

  const weekAgo = Date.now() - 7 * 86_400_000;

  // «В процессе» — это отклики между приглашением и выходом: именно за них
  // отвечает HR-менеджер, и именно они теряются, если о них не напоминать.
  const active: ApplicationStatus[] = ['VIEWED', 'INVITED', 'INTERVIEW'];
  const studentById = new Map(students.map((s) => [s.id, s]));
  const vacancyIds = applications.filter((a) => active.includes(a.status)).map((a) => a.vacancyId);
  const vacancies = await store.vacancies.findManyByIds(vacancyIds);
  const vacancyById = new Map(vacancies.map((v) => [v.id, v]));

  const inProgress = applications
    .filter((a) => active.includes(a.status))
    .sort((a, b) => +b.statusChangedAt - +a.statusChangedAt)
    .flatMap((application) => {
      const student = studentById.get(application.studentId);
      const vacancy = vacancyById.get(application.vacancyId);
      if (!student || !vacancy) return [];
      return [
        {
          studentId: student.id,
          fullName: studentName(student),
          photoUrl: student.photoUrl,
          university: student.university,
          vacancyTitle: vacancy.title,
          company: employers.get(vacancy.employerId)?.companyName ?? '—',
          status: application.status,
          updatedAt: application.statusChangedAt.toISOString(),
        },
      ];
    })
    .slice(0, 12);

  // Студенты по учреждениям. Вписанные вручную — одной строкой: по ней
  // видно, насколько справочник покрывает реальных студентов
  const schoolName = new Map(schools.map((i) => [i.id, i.shortName ?? i.name]));
  const bySchool = new Map<string, AdminStats['institutions'][number]>();
  for (const s of students) {
    const id = s.institutionId && schoolName.has(s.institutionId) ? s.institutionId : null;
    const key = id ?? 'OTHER';
    const row = bySchool.get(key) ?? { id, name: id ? (schoolName.get(id) ?? 'Вуз') : 'Не из справочника', students: 0, verified: 0 };
    row.students++;
    if (s.studyVerified) row.verified++;
    bySchool.set(key, row);
  }

  const hired = byApplicationStatus.HIRED;

  return {
    students: {
      total: students.length,
      byStatus: byStudentStatus,
      newThisWeek: students.filter((s) => +s.createdAt > weekAgo).length,
    },
    swipes: { ...swipes, total: swipes.right + swipes.left },
    applications: {
      total: applications.length,
      byStatus: byApplicationStatus,
      conversion: applications.length ? Math.round((hired / applications.length) * 100) : 0,
    },
    vacancies: vacancyCounts,
    moderation: {
      companies: Array.from(employers.values()).filter((e) => e.moderationStatus === 'PENDING').length,
      vacancies: pendingVacancies.length,
    },
    institutions: Array.from(bySchool.values()).sort((a, b) => b.students - a.students),
    inProgress,
    lastSync: lastSync ? toSyncRunDTO(lastSync) : null,
  };
}

export function toSyncRunDTO(run: {
  id: string;
  source: string;
  status: SyncRunDTO['status'];
  startedAt: Date;
  finishedAt: Date | null;
  created: number;
  updated: number;
  deactivated: number;
  error: string | null;
}): SyncRunDTO {
  return {
    id: run.id,
    source: run.source,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    created: run.created,
    updated: run.updated,
    deactivated: run.deactivated,
    error: run.error,
  };
}

export async function listAuditEntries(limit = 30): Promise<AuditEntryDTO[]> {
  const store = await getStore();
  const rows = await store.audit.list(limit);
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    actorLabel: r.actorLabel,
    ip: r.ip,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function listSyncRuns(limit = 8): Promise<SyncRunDTO[]> {
  const store = await getStore();
  return (await store.syncRuns.list(limit)).map(toSyncRunDTO);
}

/** Профиль текущего студента для шапки и раздела «Профиль». */
export async function getStudentProfile(studentId: string) {
  const store = await getStore();
  const student = await store.students.findById(studentId);
  if (!student) return null;
  const account = await store.accounts.findById(student.accountId);
  return toStudentDTO(student, account ? decryptSafe(account.emailEnc) : '', {
    includeContacts: true,
    includeBirthDate: true,
  });
}

/**
 * Публичная страница компании.
 *
 * Только одобренная: компания на модерации или отклонённая для студента
 * и гостя не существует — ответ тот же, что и для несуществующей, чтобы по
 * нему нельзя было перебирать, кто зарегистрировался.
 *
 * Контактного лица здесь нет: это персональные данные, а страница открыта
 * без входа.
 */
export async function getCompanyPublic(employerId: string): Promise<CompanyPublicDTO | null> {
  const store = await getStore();
  const employer = await store.employers.findById(employerId);
  if (!employer || employer.moderationStatus !== 'APPROVED') return null;

  // Та же видимость, что у ленты: вакансия на проверке и снятая не считаются
  const open = (await store.vacancies.listByEmployer(employer.id)).filter((v) => isVacancyVisible(v, employer));
  return {
    id: employer.id,
    companyName: employer.companyName,
    logoUrl: employer.logoUrl,
    industry: employer.industry,
    about: employer.about,
    culture: employer.culture,
    website: employer.website,
    city: employer.city,
    socials: employer.socials,
    photos: employer.photos,
    videoUrl: employer.videoUrl,
    activeVacancies: open.length,
    vacancies: open.map((v) => ({ id: v.id, title: v.title, city: v.city, employmentType: v.employmentType })),
  };
}

/**
 * Вакансии своей компании для кабинета — все статусы, с числом откликов.
 *
 * Вакансия из CRM, закрытая в CRM, показывается снятой: статус модерации у
 * неё «опубликована», но студент её уже не видит, и кабинет не должен
 * утверждать обратное.
 */
export async function listEmployerVacancies(employerId: string): Promise<EmployerVacancyDTO[]> {
  const store = await getStore();
  const vacancies = await store.vacancies.listByEmployer(employerId);
  const applications = await store.applications.listByVacancyIds(vacancies.map((v) => v.id));
  const counts = new Map<string, number>();
  for (const a of applications) counts.set(a.vacancyId, (counts.get(a.vacancyId) ?? 0) + 1);

  return vacancies
    .sort((a, b) => +b.updatedAt - +a.updatedAt)
    .map((v) => ({
      id: v.id,
      title: v.title,
      status: v.status === 'PUBLISHED' && !v.isActive ? 'CLOSED' : v.status,
      fromCrm: v.crmId !== null,
      moderationNote: v.status === 'REJECTED' ? v.moderationNote : null,
      applications: counts.get(v.id) ?? 0,
      city: v.city,
      employmentType: v.employmentType,
      updatedAt: v.updatedAt.toISOString(),
    }));
}

/** Своя вакансия для формы. Чужая — null, как несуществующая. */
export async function getEmployerVacancy(employerId: string, id: string): Promise<VacancyRecord | null> {
  const store = await getStore();
  const vacancy = await store.vacancies.findById(id);
  return vacancy && vacancy.employerId === employerId ? vacancy : null;
}

export interface ModerationQueue {
  companies: ModerationCompanyDTO[];
  vacancies: ModerationVacancyDTO[];
}

/**
 * Очередь модерации: компании, зарегистрированные сами, и вакансии из
 * кабинетов. Старые заявки первыми — кто дольше ждёт, того и смотрят.
 *
 * Почту контактного лица HR видит: без неё не уточнить, что за компания,
 * а администратору и так доступны все данные.
 */
export async function buildModerationQueue(): Promise<ModerationQueue> {
  const store = await getStore();
  const [employers, pending] = await Promise.all([store.employers.list(), store.vacancies.listByStatus('PENDING')]);
  const employerById = new Map(employers.map((e) => [e.id, e]));

  const companies: ModerationCompanyDTO[] = [];
  const waiting = employers.filter((e) => e.moderationStatus === 'PENDING').sort((a, b) => +a.createdAt - +b.createdAt);
  for (const employer of waiting) {
    const account = await store.accounts.findById(employer.accountId);
    companies.push({
      id: employer.id,
      companyName: employer.companyName,
      contactName: employer.contactName,
      email: account ? decryptSafe(account.emailEnc) : '',
      inn: employer.inn,
      phone: decryptSafe(employer.phoneEnc, '') || null,
      freeEmail: isFreeEmail(account ? decryptSafe(account.emailEnc) : ''),
      logoUrl: employer.logoUrl,
      industry: employer.industry,
      city: employer.city,
      about: employer.about,
      website: employer.website,
      createdAt: employer.createdAt.toISOString(),
      pendingVacancies: pending.filter((v) => v.employerId === employer.id).length,
    });
  }

  const vacancies = pending.flatMap((vacancy): ModerationVacancyDTO[] => {
    const employer = employerById.get(vacancy.employerId);
    if (!employer) return [];
    const dto = toVacancyDTO(vacancy, employer);
    return [
      {
        companyId: employer.id,
        companyStatus: employer.moderationStatus,
        submittedAt: (vacancy.submittedAt ?? vacancy.updatedAt).toISOString(),
        version: vacancy.updatedAt.toISOString(),
        // Страница неодобренной компании не публична — ссылке из карточки вести некуда
        vacancy: employer.moderationStatus === 'APPROVED' ? dto : { ...dto, companyId: null },
      },
    ];
  });

  return { companies, vacancies };
}

/** Сколько ждёт решения HR — для счётчика в навигации панели. */
export async function countPendingModeration(): Promise<number> {
  const store = await getStore();
  const [employers, vacancies] = await Promise.all([store.employers.list(), store.vacancies.listByStatus('PENDING')]);
  return employers.filter((e) => e.moderationStatus === 'PENDING').length + vacancies.length;
}

function toInstitutionPublic(item: InstitutionRecord): InstitutionPublicDTO {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    shortName: item.shortName,
    city: item.city,
    description: item.description,
    directions: item.directions,
    website: item.website,
  };
}

/** Справочник вузов для подсказок при вводе. */
export async function listInstitutionOptions(): Promise<InstitutionOption[]> {
  const store = await getStore();
  // Пилот идёт в одном городе: вузы других городов в подсказках только путали бы
  return (await store.institutions.list())
    .filter((item) => item.city === PILOT_CITY)
    .map(({ id, slug, name, shortName, city }) => ({
    id,
    slug,
    name,
    shortName,
    city,
  }));
}

export async function listInstitutionsPublic(): Promise<InstitutionPublicDTO[]> {
  const store = await getStore();
  return (await store.institutions.list()).filter((item) => item.city === PILOT_CITY).map(toInstitutionPublic);
}

export async function getInstitutionPublic(slug: string): Promise<InstitutionPublicDTO | null> {
  const store = await getStore();
  const item = await store.institutions.findBySlug(slug);
  return item && item.city === PILOT_CITY ? toInstitutionPublic(item) : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(value * 10) / 10;
}

/**
 * Метрики пилота с доски Miro.
 *
 * Считаются по текущим данным, а не только по журналу событий: журнал
 * появился посреди пилота, и всё, что было до него, иначе выпало бы из
 * метрик. Журнал нужен там, где данных не хватает: первый просмотр
 * профиля и момент первого приглашения — статус отклика хранит только
 * последнее изменение.
 *
 * «Первая возможность» — первое приглашение, собеседование или выход на
 * работу по любому отклику студента.
 */
export async function buildPilotMetrics(): Promise<PilotMetricsDTO> {
  const store = await getStore();
  const [students, applications, employers, vacancyCounts, visible, pathEvents, latest, counts] = await Promise.all([
    store.students.list(),
    store.applications.listAll(),
    store.employers.list(),
    store.vacancies.countAll(),
    store.vacancies.listActive(),
    // Только события пути и без потолка на общее число: срез «последних N»
    // через несколько тысяч событий тихо занижал бы метрики
    store.events.list({ types: ['application.created', 'application.next_step'], limit: 1_000_000 }),
    store.events.list({ limit: 50 }),
    store.events.countByType(['profile.viewed']),
  ]);

  const studentById = new Map(students.map((s) => [s.id, s]));
  const nextStep = new Set<string>(NEXT_STEP_STATUSES);
  const keepEarliest = (map: Map<string, number>, key: string, time: number) => {
    const previous = map.get(key);
    if (previous === undefined || time < previous) map.set(key, time);
  };

  const firstApplication = new Map<string, number>();
  const firstOpportunity = new Map<string, number>();
  for (const a of applications) {
    if (!studentById.has(a.studentId)) continue;
    keepEarliest(firstApplication, a.studentId, +a.createdAt);
    if (nextStep.has(a.status)) keepEarliest(firstOpportunity, a.studentId, +a.statusChangedAt);
  }
  // Отклик мог быть отозван свайпом влево: события о нём остаются, и
  // студент по-прежнему считается откликнувшимся
  for (const e of pathEvents) {
    if (!e.studentId || !studentById.has(e.studentId)) continue;
    if (e.type === 'application.created') keepEarliest(firstApplication, e.studentId, +e.createdAt);
    if (e.type === 'application.next_step') keepEarliest(firstOpportunity, e.studentId, +e.createdAt);
  }
  // Приглашённый откликался, даже если отклик потом отозван, — доля не
  // может перевалить за 100%
  const applied = new Set(Array.from(firstApplication.keys()).concat(Array.from(firstOpportunity.keys())));

  const sinceRegistration = (map: Map<string, number>, unitMs: number) =>
    Array.from(map.entries()).flatMap(([id, time]) => {
      const student = studentById.get(id);
      return student ? [Math.max(0, time - +student.createdAt) / unitMs] : [];
    });

  const selfRegistered = employers.filter((e) => !e.crmClientId);
  const titles = new Map(
    (
      await store.vacancies.findManyByIds(
        Array.from(new Set(latest.flatMap((e) => (e.vacancyId ? [e.vacancyId] : [])))),
      )
    ).map((v) => [v.id, v.title]),
  );
  const companyName = new Map(employers.map((e) => [e.id, e.companyName]));

  return {
    students: {
      registered: students.length,
      completedProfile: students.filter((s) => profileCompleteness(s).percent >= COMPLETE_PROFILE_PERCENT).length,
      applied: applied.size,
      gotOpportunity: firstOpportunity.size,
      verified: students.filter((s) => s.studyVerified).length,
    },
    companies: {
      total: employers.length,
      selfRegistered: selfRegistered.length,
      approved: selfRegistered.filter((e) => e.moderationStatus === 'APPROVED').length,
      withPublishedVacancy: new Set(visible.map((v) => v.employerId)).size,
    },
    vacancies: {
      published: vacancyCounts.active,
      fromCabinet: visible.filter((v) => !v.crmId).length,
    },
    applications: {
      total: applications.length,
      viewed: applications.filter((a) => a.status !== 'NEW').length,
      nextStep: applications.filter((a) => nextStep.has(a.status)).length,
      hired: applications.filter((a) => a.status === 'HIRED').length,
    },
    profileViews: counts['profile.viewed'] ?? 0,
    timing: {
      firstApplicationHours: median(sinceRegistration(firstApplication, 3_600_000)),
      firstOpportunityDays: median(sinceRegistration(firstOpportunity, 86_400_000)),
    },
    events: latest.map((e) => ({
      id: e.id,
      type: e.type,
      label: EVENT_LABEL[e.type as EventType] ?? e.type,
      subject:
        (e.vacancyId ? titles.get(e.vacancyId) : undefined) ??
        (e.employerId ? companyName.get(e.employerId) : undefined) ??
        null,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

/** Студенты для панели HR, новые первыми, с числом откликов. */
export async function listAdminStudents(): Promise<AdminStudentDTO[]> {
  const store = await getStore();
  const [students, applications] = await Promise.all([store.students.list(), store.applications.listAll()]);
  const counts = new Map<string, number>();
  for (const a of applications) counts.set(a.studentId, (counts.get(a.studentId) ?? 0) + 1);

  return students.map((s) => ({
    id: s.id,
    fullName: studentName(s),
    photoUrl: s.photoUrl,
    university: s.university,
    institutionId: s.institutionId,
    speciality: s.speciality,
    studyYear: s.studyYear,
    city: s.city,
    status: s.status,
    studyVerified: s.studyVerified,
    study: studyStatus(s),
    studyDocUrl: s.studyDocUrl,
    studyDocName: s.studyDocName,
    studyDocAt: s.studyDocAt?.toISOString() ?? null,
    studyReviewNote: s.studyReviewNote,
    applications: counts.get(s.id) ?? 0,
    createdAt: s.createdAt.toISOString(),
  }));
}

/**
 * Свайпы вправо, которые ждут подтверждения учёбы, — у студента без
 * отметки и без отклика на эту вакансию. Просроченные удаляются здесь же:
 * через две недели отклик уже никому не нужен, а вакансия возвращается в ленту.
 */
async function expirePendingSwipes(studentId: string): Promise<{ student: StudentRecord | null; waiting: SwipeRecord[] }> {
  const store = await getStore();
  const [student, rights, applications] = await Promise.all([
    store.students.findById(studentId),
    store.swipes.listByStudent(studentId, 'RIGHT'),
    store.applications.listByStudent(studentId),
  ]);
  // Ждут, пока не подтверждены и учёба, и почта
  const account = student ? await store.accounts.findById(student.accountId) : null;
  if (!student || applicationsOpen(student, account)) return { student, waiting: [] };
  const applied = new Set(applications.map((a) => a.vacancyId));
  const now = new Date();
  const waiting: SwipeRecord[] = [];
  for (const swipe of rights) {
    if (applied.has(swipe.vacancyId)) continue;
    if (isPendingExpired(swipe.createdAt, now)) await store.swipes.remove(studentId, swipe.vacancyId);
    else waiting.push(swipe);
  }
  return { student, waiting };
}

/** Сколько откликов ждёт подтверждения учёбы — для счётчика во вкладке. */
export async function countWaitingApplications(studentId: string): Promise<number> {
  return (await expirePendingSwipes(studentId)).waiting.length;
}

/** Свайпы, которые ждут подтверждения, — для напоминаний (lib/notify.ts). */
export async function listWaitingSwipes(studentId: string): Promise<SwipeRecord[]> {
  return (await expirePendingSwipes(studentId)).waiting;
}

/** Ожидающие отклики с карточкой вакансии и сроком, когда удалятся. */
export async function listPendingApplications(studentId: string): Promise<PendingApplicationDTO[]> {
  const { student, waiting } = await expirePendingSwipes(studentId);
  if (!student || waiting.length === 0) return [];
  const store = await getStore();
  const [vacancies, employers] = await Promise.all([
    store.vacancies.findManyByIds(waiting.map((s) => s.vacancyId)),
    employerIndex(),
  ]);
  const byId = new Map(vacancies.map((v) => [v.id, v]));
  return waiting.flatMap((swipe) => {
    const vacancy = byId.get(swipe.vacancyId);
    if (!vacancy) return [];
    const employer = employers.get(vacancy.employerId) ?? null;
    const shown = studentFacingVacancy(vacancy, employer);
    return [
      {
        vacancy: toVacancyDTO(shown, employer, scoreMatch(student, shown)),
        swipedAt: swipe.createdAt.toISOString(),
        expiresAt: pendingExpiresAt(swipe.createdAt).toISOString(),
      },
    ];
  });
}

/**
 * Учёба подтверждена — ожидавшие отклики уходят работодателям.
 *
 * Вакансия, которую за это время сняли или вернули на проверку, пропускается,
 * и свайп по ней удаляется: откликнуться на неё сейчас нельзя, а в ленту она
 * вернётся, когда её снова опубликуют. Возвращает id ушедших откликов —
 * по ним компаниям уходят письма.
 */
export async function releasePendingApplications(studentId: string): Promise<string[]> {
  const store = await getStore();
  const [student, rights, applications, employers] = await Promise.all([
    store.students.findById(studentId),
    store.swipes.listByStudent(studentId, 'RIGHT'),
    store.applications.listByStudent(studentId),
    employerIndex(),
  ]);
  if (!student) return [];
  // Уходят, только когда подтверждены и учёба, и почта — что бы из двух ни подтвердили последним
  const account = await store.accounts.findById(student.accountId);
  if (!applicationsOpen(student, account)) return [];
  const applied = new Set(applications.map((a) => a.vacancyId));
  const waiting = rights.filter((s) => !applied.has(s.vacancyId));
  if (waiting.length === 0) return [];

  const vacancies = await store.vacancies.findManyByIds(waiting.map((s) => s.vacancyId));
  const byId = new Map(vacancies.map((v) => [v.id, v]));
  const now = new Date();
  const released: string[] = [];
  for (const swipe of waiting) {
    const vacancy = byId.get(swipe.vacancyId);
    if (!vacancy || isPendingExpired(swipe.createdAt, now) || !isVacancyVisible(vacancy, employers.get(vacancy.employerId))) {
      await store.swipes.remove(studentId, swipe.vacancyId);
      continue;
    }
    const application = await store.applications.upsert({ studentId, vacancyId: vacancy.id });
    await track('application.created', {
      studentId,
      employerId: vacancy.employerId,
      vacancyId: vacancy.id,
      applicationId: application.id,
    });
    released.push(application.id);
  }
  if (released.length > 0 && student.status === 'ACTIVE') await store.students.setStatus(studentId, 'IN_PROGRESS');
  return released;
}

/** Статус учёбы и сроки справки — одинаково для профиля, ленты и откликов. */
export function buildStudyState(student: StudentRecord): StudyStateDTO {
  const deadline = studyDocDeadline(student.createdAt);
  const now = new Date();
  return {
    status: studyStatus(student),
    docName: student.studyDocName,
    docAt: student.studyDocAt?.toISOString() ?? null,
    note: student.studyReviewNote,
    deadline: deadline.toISOString(),
    workdaysLeft: workdaysLeft(deadline, now),
    deadlinePassed: +now >= +deadline,
  };
}

/** Сколько справок ждёт решения HR — для счётчика на вкладке «Студенты». */
export async function countPendingStudyDocs(): Promise<number> {
  const store = await getStore();
  return (await store.students.list()).filter((s) => !s.studyVerified && s.studyDocUrl).length;
}

/** Адреса вакансий компании без повторов — подсказка для новой вакансии. */
export async function listEmployerAddresses(employerId: string): Promise<CompanyAddress[]> {
  const store = await getStore();
  const seen = new Set<string>();
  const addresses: CompanyAddress[] = [];
  for (const vacancy of await store.vacancies.listByEmployer(employerId)) {
    if (!vacancy.address) continue;
    const key = [vacancy.city, vacancy.address, vacancy.addressDetails ?? ''].join('|').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    addresses.push({
      city: vacancy.city,
      district: vacancy.district,
      address: vacancy.address,
      addressDetails: vacancy.addressDetails,
    });
  }
  return addresses;
}

/**
 * Рейтинг учебных заведений пилота. Только студенты с подтверждённой учёбой;
 * правила мест и порогов — в lib/rating.ts.
 *
 * «Приглашены» и «работают» считаются по текущему статусу откликов: студент,
 * которого пригласили, а потом отказали, в «приглашённые» уже не попадает.
 */
export async function buildInstitutionRating(): Promise<RatingRow[]> {
  const store = await getStore();
  const [institutions, students, applications] = await Promise.all([
    store.institutions.list(),
    store.students.list(),
    store.applications.listAll(),
  ]);

  const verified = new Map<string, StudentRecord[]>();
  for (const student of students) {
    if (!student.studyVerified || !student.institutionId) continue;
    verified.set(student.institutionId, [...(verified.get(student.institutionId) ?? []), student]);
  }
  const byStudent = new Map<string, ApplicationStatus[]>();
  for (const application of applications) {
    byStudent.set(application.studentId, [...(byStudent.get(application.studentId) ?? []), application.status]);
  }
  const nextStep = new Set<string>(NEXT_STEP_STATUSES);

  return rankInstitutions(
    institutions
      .filter((item) => item.city === PILOT_CITY)
      .map((item) => {
        const list = verified.get(item.id) ?? [];
        let applied = 0;
        let invited = 0;
        let hired = 0;
        for (const student of list) {
          const statuses = byStudent.get(student.id) ?? [];
          applied += statuses.length;
          if (statuses.some((status) => nextStep.has(status))) invited++;
          if (statuses.includes('HIRED')) hired++;
        }
        return {
          slug: item.slug,
          label: item.shortName ?? item.name,
          name: item.name,
          students: list.length,
          applications: applied,
          invited,
          hired,
        };
      }),
  );
}

/** Строка рейтинга одного вуза — для его страницы. */
export async function getInstitutionRating(slug: string): Promise<RatingRow | null> {
  return (await buildInstitutionRating()).find((row) => row.slug === slug) ?? null;
}
