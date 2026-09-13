import 'server-only';
import { randomUUID } from 'node:crypto';
import { blindIndex, encrypt, hashToken } from '@/lib/security/crypto';
import { EMPTY_PORTFOLIO } from '@/lib/portfolio';
import { hashPassword } from '@/lib/security/password';
import type { ApplicationStatus, StudentStatus, SwipeDirection } from '@/lib/types';
import {
  CONSENT_VERSION,
  CRM_VACANCIES,
  DEMO_APPLICATION_FUNNEL,
  DEMO_CHAT,
  DEMO_CREDENTIALS,
  DEMO_EXTRA_STUDENTS,
  DEMO_STUDENT_PROFILE,
  extraStudentEmail,
  extraStudentPhone,
} from './seed-data';
import type {
  AccessCodeRecord,
  AccountRecord,
  ApplicationRecord,
  AuditRecord,
  CrmVacancyInput,
  DataStore,
  EmployerRecord,
  MessageRecord,
  NewStudentInput,
  StudentRecord,
  SwipeRecord,
  SyncOutcome,
  SyncRunRecord,
  VacancyRecord,
} from './types';

/**
 * Демонстрационное хранилище в памяти процесса.
 *
 * Нужно ровно для одного: запустить и посмотреть продукт без поднятого
 * PostgreSQL. Данные живут до перезапуска сервера и не переживают
 * масштабирование на несколько инстансов — поэтому в production режим
 * не включается (см. index.ts).
 *
 * Шифрование ПДн здесь настоящее, а не заглушка: демо-режим не должен
 * обходить контур безопасности, иначе он перестаёт быть репетицией.
 */

interface Tables {
  accounts: AccountRecord[];
  students: StudentRecord[];
  employers: EmployerRecord[];
  vacancies: VacancyRecord[];
  swipes: SwipeRecord[];
  applications: ApplicationRecord[];
  messages: MessageRecord[];
  accessCodes: AccessCodeRecord[];
  syncRuns: SyncRunRecord[];
  audit: AuditRecord[];
}

const clone = <T>(value: T): T => structuredClone(value);
const now = () => new Date();

async function seed(): Promise<Tables> {
  const t: Tables = {
    accounts: [],
    students: [],
    employers: [],
    vacancies: [],
    swipes: [],
    applications: [],
    messages: [],
    accessCodes: [],
    syncRuns: [],
    audit: [],
  };

  // --- Работодатели и вакансии из «CRM» ---
  const employerByCrmId = new Map<string, EmployerRecord>();
  for (const item of CRM_VACANCIES) {
    let employer = employerByCrmId.get(item.crmClientId);
    if (!employer) {
      const account: AccountRecord = {
        id: randomUUID(),
        role: 'EMPLOYER',
        emailEnc: encrypt(item.contactEmail),
        emailHash: blindIndex(item.contactEmail),
        passwordHash: null,
        isActive: true,
        lastLoginAt: null,
        createdAt: now(),
      };
      t.accounts.push(account);
      employer = {
        id: randomUUID(),
        accountId: account.id,
        companyName: item.companyName,
        contactName: item.contactName,
        logoUrl: null,
        crmClientId: item.crmClientId,
        createdAt: now(),
      };
      t.employers.push(employer);
      employerByCrmId.set(item.crmClientId, employer);
    }
    t.vacancies.push(vacancyFromCrm(item, employer.id));
  }

  // Код доступа работодателя — выдаётся в CRM, паролей у работодателя нет
  const demoEmployer = employerByCrmId.get(DEMO_CREDENTIALS.employerCrmClientId);
  if (demoEmployer) {
    t.accessCodes.push({
      id: randomUUID(),
      accountId: demoEmployer.accountId,
      codeHash: hashToken(DEMO_CREDENTIALS.employerCode),
      label: 'Демо-доступ из CRM',
      expiresAt: null,
      lastUsedAt: null,
      createdAt: now(),
    });
  }

  // --- Администратор ---
  const adminAccount: AccountRecord = {
    id: randomUUID(),
    role: 'ADMIN',
    emailEnc: encrypt(DEMO_CREDENTIALS.admin.email),
    emailHash: blindIndex(DEMO_CREDENTIALS.admin.email),
    passwordHash: await hashPassword(DEMO_CREDENTIALS.admin.password),
    isActive: true,
    lastLoginAt: null,
    createdAt: now(),
  };
  t.accounts.push(adminAccount);

  // --- Демо-студент ---
  const studentAccount: AccountRecord = {
    id: randomUUID(),
    role: 'STUDENT',
    emailEnc: encrypt(DEMO_CREDENTIALS.student.email),
    emailHash: blindIndex(DEMO_CREDENTIALS.student.email),
    passwordHash: await hashPassword(DEMO_CREDENTIALS.student.password),
    isActive: true,
    lastLoginAt: null,
    createdAt: now(),
  };
  t.accounts.push(studentAccount);

  const student: StudentRecord = {
    id: randomUUID(),
    accountId: studentAccount.id,
    fullNameEnc: encrypt(DEMO_STUDENT_PROFILE.fullName),
    phoneEnc: encrypt(DEMO_STUDENT_PROFILE.phone),
    gender: DEMO_STUDENT_PROFILE.gender,
    birthYear: DEMO_STUDENT_PROFILE.birthYear,
    photoUrl: null,
    resumeUrl: null,
    resumeName: null,
    university: DEMO_STUDENT_PROFILE.university,
    speciality: DEMO_STUDENT_PROFILE.speciality,
    studyYear: DEMO_STUDENT_PROFILE.studyYear,
    city: DEMO_STUDENT_PROFILE.city,
    workDays: [...DEMO_STUDENT_PROFILE.workDays],
    hoursPerWeek: DEMO_STUDENT_PROFILE.hoursPerWeek,
    skills: [...DEMO_STUDENT_PROFILE.skills],
    about: DEMO_STUDENT_PROFILE.about,
    lookingFor: [...DEMO_STUDENT_PROFILE.lookingFor],
    goals: DEMO_STUDENT_PROFILE.goals,
    projects: structuredClone(DEMO_STUDENT_PROFILE.projects),
    achievements: structuredClone(DEMO_STUDENT_PROFILE.achievements),
    activities: structuredClone(DEMO_STUDENT_PROFILE.activities),
    hobbies: DEMO_STUDENT_PROFILE.hobbies,
    links: structuredClone(DEMO_STUDENT_PROFILE.links),
    videoUrl: DEMO_STUDENT_PROFILE.videoUrl,
    status: 'IN_PROGRESS',
    consentVersion: CONSENT_VERSION,
    consentAt: now(),
    consentIp: '127.0.0.1',
    createdAt: new Date(Date.now() - 9 * 86_400_000),
    updatedAt: now(),
  };
  t.students.push(student);

  // --- Ещё несколько студентов, чтобы кабинет работодателя и статистика
  //     не выглядели пустыми ---
  for (const [i, extra] of DEMO_EXTRA_STUDENTS.entries()) {
    const email = extraStudentEmail(i);
    const acc: AccountRecord = {
      id: randomUUID(),
      role: 'STUDENT',
      emailEnc: encrypt(email),
      emailHash: blindIndex(email),
      passwordHash: await hashPassword(DEMO_CREDENTIALS.student.password),
      isActive: true,
      lastLoginAt: null,
      createdAt: now(),
    };
    t.accounts.push(acc);
    t.students.push({
      ...student,
      id: randomUUID(),
      accountId: acc.id,
      fullNameEnc: encrypt(extra.fullName),
      phoneEnc: encrypt(extraStudentPhone(i)),
      gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
      birthYear: extra.birthYear,
      university: extra.university,
      speciality: extra.speciality,
      studyYear: 2 + (i % 3),
      skills: [...extra.skills],
      status: extra.status,
      about: null,
      // Без этого все получили бы портфолио демо-студента через ...student
      ...structuredClone(EMPTY_PORTFOLIO),
      createdAt: new Date(Date.now() - (3 + i * 4) * 86_400_000),
    });
  }

  // --- Немного истории: отклики уже есть, воронка не пустая ---
  const funnel = DEMO_APPLICATION_FUNNEL;
  const seededApplications: ApplicationRecord[] = [];
  t.students.forEach((s, idx) => {
    const vacancy = t.vacancies[(idx * 3) % t.vacancies.length];
    if (!vacancy) return;
    const createdAt = new Date(Date.now() - (idx + 1) * 36_000_00 * 6);
    t.swipes.push({
      id: randomUUID(),
      studentId: s.id,
      vacancyId: vacancy.id,
      direction: 'RIGHT',
      createdAt,
    });
    const application: ApplicationRecord = {
      id: randomUUID(),
      studentId: s.id,
      vacancyId: vacancy.id,
      status: funnel[idx % funnel.length] ?? 'NEW',
      employerNote: null,
      statusChangedAt: createdAt,
      createdAt,
      lastMessageAt: null,
    };
    t.applications.push(application);
    seededApplications.push(application);
    // И один пропуск, чтобы раздел «Пропущенные» тоже был живым
    const skipped = t.vacancies[(idx * 3 + 1) % t.vacancies.length];
    if (skipped) {
      t.swipes.push({
        id: randomUUID(),
        studentId: s.id,
        vacancyId: skipped.id,
        direction: 'LEFT',
        createdAt: new Date(createdAt.getTime() + 60_000),
      });
    }
  });


  // --- Переписка. Диалог открывает работодатель: пока он не отреагировал
  //     на отклик, письмо студента было бы монологом в пустоту. ---
  function seedMessage(applicationId: string, author: 'STUDENT' | 'EMPLOYER', body: string, minutesAgo: number, read: boolean) {
    const createdAt = new Date(Date.now() - minutesAgo * 60_000);
    t.messages.push({
      id: randomUUID(),
      applicationId,
      author,
      bodyEnc: encrypt(body),
      readAt: read ? new Date(createdAt.getTime() + 90_000) : null,
      createdAt,
    });
    const app = t.applications.find((a) => a.id === applicationId);
    if (app && (!app.lastMessageAt || app.lastMessageAt < createdAt)) app.lastMessageAt = createdAt;
  }

  for (const line of DEMO_CHAT) {
    const application = seededApplications[line.applicationIndex];
    if (application) seedMessage(application.id, line.author, line.body, line.minutesAgo, line.read);
  }

  t.syncRuns.push({
    id: randomUUID(),
    source: 'crm',
    status: 'SUCCESS',
    startedAt: new Date(Date.now() - 3_600_000),
    finishedAt: new Date(Date.now() - 3_598_000),
    created: CRM_VACANCIES.length,
    updated: 0,
    deactivated: 0,
    error: null,
  });

  return t;
}

function vacancyFromCrm(item: CrmVacancyInput, employerId: string): VacancyRecord {
  return {
    id: randomUUID(),
    crmId: item.crmId,
    employerId,
    title: item.title,
    summary: item.summary,
    responsibilities: item.responsibilities,
    requirements: item.requirements,
    perks: item.perks,
    salaryFrom: item.salaryFrom,
    salaryTo: item.salaryTo,
    salaryPeriod: item.salaryPeriod,
    city: item.city,
    district: item.district,
    workFormat: item.workFormat,
    employmentType: item.employmentType,
    shiftDays: item.shiftDays,
    hoursPerWeek: item.hoursPerWeek,
    tags: item.tags,
    isHot: item.isHot,
    isActive: item.isActive,
    publishedAt: item.publishedAt,
    syncedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  };
}

export async function createMemoryStore(): Promise<DataStore> {
  const t = await seed();

  const store: DataStore = {
    kind: 'memory',

    accounts: {
      async findByEmailHash(emailHash) {
        return clone(t.accounts.find((a) => a.emailHash === emailHash) ?? null);
      },
      async findById(id) {
        return clone(t.accounts.find((a) => a.id === id) ?? null);
      },
      async touchLogin(id) {
        const acc = t.accounts.find((a) => a.id === id);
        if (acc) acc.lastLoginAt = now();
      },
    },

    students: {
      async createWithAccount(input: NewStudentInput) {
        const emailHash = blindIndex(input.email);
        if (t.accounts.some((a) => a.emailHash === emailHash)) {
          throw new AccountExistsError();
        }
        const account: AccountRecord = {
          id: randomUUID(),
          role: 'STUDENT',
          emailEnc: encrypt(input.email),
          emailHash,
          passwordHash: await hashPassword(input.password),
          isActive: true,
          lastLoginAt: null,
          createdAt: now(),
        };
        const student: StudentRecord = {
          id: randomUUID(),
          accountId: account.id,
          fullNameEnc: encrypt(input.fullName),
          phoneEnc: input.phone ? encrypt(input.phone) : null,
          gender: input.gender,
          birthYear: input.birthYear,
          photoUrl: input.photoUrl,
          resumeUrl: input.resumeUrl,
          resumeName: input.resumeName,
          university: input.university,
          speciality: input.speciality,
          studyYear: input.studyYear,
          city: input.city,
          workDays: input.workDays,
          hoursPerWeek: input.hoursPerWeek,
          skills: input.skills,
          about: input.about,
          ...structuredClone(EMPTY_PORTFOLIO),
          lookingFor: [...input.lookingFor],
          status: 'ACTIVE',
          consentVersion: input.consentVersion,
          consentAt: now(),
          consentIp: input.consentIp,
          createdAt: now(),
          updatedAt: now(),
        };
        t.accounts.push(account);
        t.students.push(student);
        return { account: clone(account), student: clone(student) };
      },
      async findByAccountId(accountId) {
        return clone(t.students.find((s) => s.accountId === accountId) ?? null);
      },
      async findById(id) {
        return clone(t.students.find((s) => s.id === id) ?? null);
      },
      async list() {
        return clone([...t.students].sort((a, b) => +b.createdAt - +a.createdAt));
      },
      async setStatus(id, status) {
        const s = t.students.find((x) => x.id === id);
        if (s) {
          s.status = status;
          s.updatedAt = now();
        }
      },

      async update(id, input) {
        const s = t.students.find((x) => x.id === id);
        if (!s) throw new Error('Профиль не найден');
        Object.assign(s, {
          fullNameEnc: encrypt(input.fullName),
          // Пустой телефон — отсутствие телефона, а не шифротекст пустой строки
          phoneEnc: input.phone ? encrypt(input.phone) : null,
          gender: input.gender,
          birthYear: input.birthYear,
          photoUrl: input.photoUrl,
          resumeUrl: input.resumeUrl,
          resumeName: input.resumeName,
          university: input.university,
          speciality: input.speciality,
          studyYear: input.studyYear,
          city: input.city,
          workDays: [...input.workDays],
          hoursPerWeek: input.hoursPerWeek,
          skills: [...input.skills],
          about: input.about,
          updatedAt: now(),
        });
        // Портфолио частично, как и в базе: undefined — «не менять».
        // Object.assign выше записал бы undefined поверх значения.
        const portfolioKeys = [
          'lookingFor', 'goals', 'projects', 'achievements',
          'activities', 'hobbies', 'links', 'videoUrl',
        ] as const;
        for (const key of portfolioKeys) {
          const value = input[key];
          if (value !== undefined) Object.assign(s, { [key]: structuredClone(value) });
        }
        return clone(s);
      },

      async deleteByAccountId(accountId) {
        const student = t.students.find((x) => x.accountId === accountId);
        // Каскады в базе делает схема, здесь их приходится повторять руками.
        // Порядок от листьев к корню: сообщения живут на откликах.
        if (student) {
          const applicationIds = t.applications
            .filter((a) => a.studentId === student.id)
            .map((a) => a.id);
          t.messages = t.messages.filter((m) => !applicationIds.includes(m.applicationId));
          t.applications = t.applications.filter((a) => a.studentId !== student.id);
          t.swipes = t.swipes.filter((s) => s.studentId !== student.id);
          t.students = t.students.filter((s) => s.id !== student.id);
        }
        t.accounts = t.accounts.filter((a) => a.id !== accountId);
        // Журнал аудита переживает удаление, как и в базе: запись остаётся,
        // ссылка на учётную запись обнуляется
        for (const entry of t.audit) if (entry.accountId === accountId) entry.accountId = null;
      },
    },

    employers: {
      async findByAccountId(accountId) {
        return clone(t.employers.find((e) => e.accountId === accountId) ?? null);
      },
      async findById(id) {
        return clone(t.employers.find((e) => e.id === id) ?? null);
      },
      async list() {
        return clone(t.employers);
      },
    },

    vacancies: {
      async listActive() {
        return clone(t.vacancies.filter((v) => v.isActive));
      },
      async findById(id) {
        return clone(t.vacancies.find((v) => v.id === id) ?? null);
      },
      async findManyByIds(ids) {
        const set = new Set(ids);
        return clone(t.vacancies.filter((v) => set.has(v.id)));
      },
      async listByEmployer(employerId) {
        return clone(t.vacancies.filter((v) => v.employerId === employerId));
      },
      async countAll() {
        return { active: t.vacancies.filter((v) => v.isActive).length, total: t.vacancies.length };
      },
      async syncFromCrm(items) {
        const outcome: SyncOutcome = { created: 0, updated: 0, deactivated: 0 };
        const seen = new Set<string>();

        for (const item of items) {
          seen.add(item.crmId);
          let employer = t.employers.find((e) => e.crmClientId === item.crmClientId);
          if (!employer) {
            const account: AccountRecord = {
              id: randomUUID(),
              role: 'EMPLOYER',
              emailEnc: encrypt(item.contactEmail),
              emailHash: blindIndex(item.contactEmail),
              passwordHash: null,
              isActive: true,
              lastLoginAt: null,
              createdAt: now(),
            };
            t.accounts.push(account);
            employer = {
              id: randomUUID(),
              accountId: account.id,
              companyName: item.companyName,
              contactName: item.contactName,
              logoUrl: null,
              crmClientId: item.crmClientId,
              createdAt: now(),
            };
            t.employers.push(employer);
          }

          const existing = t.vacancies.find((v) => v.crmId === item.crmId);
          if (existing) {
            Object.assign(existing, vacancyFromCrm(item, employer.id), {
              id: existing.id,
              createdAt: existing.createdAt,
            });
            outcome.updated++;
          } else {
            t.vacancies.push(vacancyFromCrm(item, employer.id));
            outcome.created++;
          }
        }

        // Вакансия, пропавшая из выгрузки, закрыта в CRM. Удалять её нельзя —
        // на ней висят отклики; снимаем с публикации.
        for (const v of t.vacancies) {
          if (v.crmId && !seen.has(v.crmId) && v.isActive) {
            v.isActive = false;
            v.updatedAt = now();
            outcome.deactivated++;
          }
        }
        return outcome;
      },
    },

    swipes: {
      async create({ studentId, vacancyId, direction }) {
        const existing = t.swipes.find((s) => s.studentId === studentId && s.vacancyId === vacancyId);
        if (existing) {
          existing.direction = direction as SwipeDirection;
          existing.createdAt = now();
          return clone(existing);
        }
        const record: SwipeRecord = {
          id: randomUUID(),
          studentId,
          vacancyId,
          direction,
          createdAt: now(),
        };
        t.swipes.push(record);
        return clone(record);
      },
      async listByStudent(studentId, direction) {
        return clone(
          t.swipes
            .filter((s) => s.studentId === studentId && (!direction || s.direction === direction))
            .sort((a, b) => +b.createdAt - +a.createdAt),
        );
      },
      async remove(studentId, vacancyId) {
        const idx = t.swipes.findIndex((s) => s.studentId === studentId && s.vacancyId === vacancyId);
        if (idx >= 0) t.swipes.splice(idx, 1);
      },
      async swipedVacancyIds(studentId) {
        return t.swipes.filter((s) => s.studentId === studentId).map((s) => s.vacancyId);
      },
      async countByDirection() {
        return {
          right: t.swipes.filter((s) => s.direction === 'RIGHT').length,
          left: t.swipes.filter((s) => s.direction === 'LEFT').length,
        };
      },
    },

    applications: {
      async upsert({ studentId, vacancyId }) {
        const existing = t.applications.find(
          (a) => a.studentId === studentId && a.vacancyId === vacancyId,
        );
        if (existing) return clone(existing);
        const record: ApplicationRecord = {
          id: randomUUID(),
          studentId,
          vacancyId,
          status: 'NEW',
          employerNote: null,
          statusChangedAt: now(),
          createdAt: now(),
          lastMessageAt: null,
        };
        t.applications.push(record);
        return clone(record);
      },
      async listByStudent(studentId) {
        return clone(
          t.applications
            .filter((a) => a.studentId === studentId)
            .sort((a, b) => +b.createdAt - +a.createdAt),
        );
      },
      async listByVacancyIds(vacancyIds) {
        const set = new Set(vacancyIds);
        return clone(
          t.applications.filter((a) => set.has(a.vacancyId)).sort((a, b) => +b.createdAt - +a.createdAt),
        );
      },
      async listAll() {
        return clone([...t.applications].sort((a, b) => +b.createdAt - +a.createdAt));
      },
      async findById(id) {
        return clone(t.applications.find((a) => a.id === id) ?? null);
      },
      async setStatus(id, status, note) {
        const app = t.applications.find((a) => a.id === id);
        if (!app) return null;
        app.status = status;
        app.statusChangedAt = now();
        if (note !== undefined) app.employerNote = note;
        return clone(app);
      },
      async removeByPair(studentId, vacancyId) {
        const idx = t.applications.findIndex(
          (a) => a.studentId === studentId && a.vacancyId === vacancyId,
        );
        if (idx >= 0) t.applications.splice(idx, 1);
      },
    },

    messages: {
      async listByApplication(applicationId) {
        return clone(
          t.messages
            .filter((m) => m.applicationId === applicationId)
            .sort((a, b) => +a.createdAt - +b.createdAt),
        );
      },
      async create({ applicationId, author, body }) {
        const record: MessageRecord = {
          id: randomUUID(),
          applicationId,
          author,
          bodyEnc: encrypt(body),
          readAt: null,
          createdAt: now(),
        };
        t.messages.push(record);
        const app = t.applications.find((a) => a.id === applicationId);
        if (app) app.lastMessageAt = record.createdAt;
        return clone(record);
      },
      async markRead(applicationId, reader) {
        // Прочитанным становится written другой стороной: своё сообщение
        // отметить прочитанным нельзя, это ничего не значит
        const stamp = now();
        let count = 0;
        for (const m of t.messages) {
          if (m.applicationId === applicationId && m.author !== reader && !m.readAt) {
            m.readAt = stamp;
            count++;
          }
        }
        return count;
      },
      async unreadFor(applicationIds, reader) {
        const wanted = new Set(applicationIds);
        const out: Record<string, number> = {};
        for (const id of applicationIds) out[id] = 0;
        for (const m of t.messages) {
          if (wanted.has(m.applicationId) && m.author !== reader && !m.readAt) out[m.applicationId]++;
        }
        return out;
      },
      async lastFor(applicationIds) {
        const wanted = new Set(applicationIds);
        const out: Record<string, MessageRecord> = {};
        for (const m of t.messages) {
          if (!wanted.has(m.applicationId)) continue;
          const current = out[m.applicationId];
          if (!current || +m.createdAt > +current.createdAt) out[m.applicationId] = m;
        }
        return clone(out);
      },
    },

    accessCodes: {
      async findByHash(codeHash) {
        return clone(t.accessCodes.find((c) => c.codeHash === codeHash) ?? null);
      },
      async markUsed(id) {
        const c = t.accessCodes.find((x) => x.id === id);
        if (c) c.lastUsedAt = now();
      },
      async issue({ accountId, codeHash, label, expiresAt }) {
        const record: AccessCodeRecord = {
          id: randomUUID(),
          accountId,
          codeHash,
          label,
          expiresAt,
          lastUsedAt: null,
          createdAt: now(),
        };
        t.accessCodes.push(record);
        return clone(record);
      },
    },

    syncRuns: {
      async start(source) {
        const run: SyncRunRecord = {
          id: randomUUID(),
          source,
          status: 'RUNNING',
          startedAt: now(),
          finishedAt: null,
          created: 0,
          updated: 0,
          deactivated: 0,
          error: null,
        };
        t.syncRuns.push(run);
        return clone(run);
      },
      async finish(id, patch) {
        const run = t.syncRuns.find((r) => r.id === id);
        if (!run) return null;
        Object.assign(run, patch, { finishedAt: now() });
        return clone(run);
      },
      async latest() {
        return clone([...t.syncRuns].sort((a, b) => +b.startedAt - +a.startedAt)[0] ?? null);
      },
      async list(limit) {
        return clone([...t.syncRuns].sort((a, b) => +b.startedAt - +a.startedAt).slice(0, limit));
      },
    },

    audit: {
      async log(entry) {
        t.audit.push({ ...entry, id: randomUUID(), createdAt: now() });
        // Журнал в памяти не должен съедать процесс на длинной сессии
        if (t.audit.length > 2000) t.audit.splice(0, t.audit.length - 2000);
      },
      async list(limit) {
        return clone([...t.audit].sort((a, b) => +b.createdAt - +a.createdAt).slice(0, limit));
      },
    },
  };

  return store;
}

/** Отдельный тип ошибки: роут регистрации отличает занятую почту от сбоя. */
export class AccountExistsError extends Error {
  constructor() {
    super('Аккаунт с такой почтой уже существует');
    this.name = 'AccountExistsError';
  }
}
