import 'server-only';
import { getStore } from '@/lib/db';
import { scoreMatch, studentName, toStudentDTO, toVacancyDTO } from '@/lib/db/mappers';
import { decryptSafe } from '@/lib/security/crypto';
import type { EmployerRecord, StudentRecord, VacancyRecord } from '@/lib/db/types';
import {
  APPLICATION_STATUSES,
  STUDENT_STATUSES,
  type AdminStats,
  type ApplicationDTO,
  type ApplicationStatus,
  type AuditEntryDTO,
  type EmployerApplicationDTO,
  type SkippedDTO,
  type StudentStatus,
  type SyncRunDTO,
  type VacancyDTO,
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
        vacancy: toVacancyDTO(
          vacancy,
          employers.get(vacancy.employerId) ?? null,
          scoreMatch(student, vacancy),
        ),
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

  return swipes.flatMap((swipe) => {
    const vacancy = byId.get(swipe.vacancyId);
    if (!vacancy) return [];
    return [
      {
        id: swipe.id,
        createdAt: swipe.createdAt.toISOString(),
        vacancy: toVacancyDTO(
          vacancy,
          employers.get(vacancy.employerId) ?? null,
          scoreMatch(student, vacancy),
        ),
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
    vacancies: vacancies.map((v) => ({
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
  const [students, applications, swipes, vacancyCounts, employers, lastSync] = await Promise.all([
    store.students.list(),
    store.applications.listAll(),
    store.swipes.countByDirection(),
    store.vacancies.countAll(),
    employerIndex(),
    store.syncRuns.latest(),
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
  return toStudentDTO(student, account ? decryptSafe(account.emailEnc) : '');
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

  const vacancies = await store.vacancies.listByEmployer(employer.id);
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
    activeVacancies: vacancies.filter((v) => v.isActive).length,
  };
}
