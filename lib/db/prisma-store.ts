import 'server-only';
import { Prisma } from '@prisma/client';
import { blindIndex, encrypt } from '@/lib/security/crypto';
import { hashPassword } from '@/lib/security/password';
import { prisma } from './prisma-client';
import { AccountExistsError } from './memory';
import type { CrmVacancyInput, DataStore, MessageRecord, SyncOutcome } from './types';

/**
 * Боевое хранилище поверх PostgreSQL.
 *
 * Записи возвращаются как есть — с зашифрованными ПДн. Расшифровка живёт
 * в mappers.ts, на границе с интерфейсом: так фильтр по роли невозможно
 * обойти, забыв про него в одном из роутов.
 */
export function createPrismaStore(): DataStore {
  return {
    kind: 'prisma',

    accounts: {
      findByEmailHash: (emailHash) => prisma.account.findUnique({ where: { emailHash } }),
      findById: (id) => prisma.account.findUnique({ where: { id } }),
      async touchLogin(id) {
        await prisma.account.update({ where: { id }, data: { lastLoginAt: new Date() } });
      },
    },

    students: {
      async createWithAccount(input) {
        const emailHash = blindIndex(input.email);
        // Хешируем до транзакции: bcrypt на cost 12 занимает сотни
        // миллисекунд, и держать на нём открытую транзакцию расточительно.
        const passwordHash = await hashPassword(input.password);
        try {
          const account = await prisma.account.create({
            data: {
              role: 'STUDENT',
              emailEnc: encrypt(input.email),
              emailHash,
              passwordHash,
              student: {
                create: {
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
                  consentVersion: input.consentVersion,
                  consentIp: input.consentIp,
                },
              },
            },
            include: { student: true },
          });
          const { student, ...rest } = account;
          if (!student) throw new Error('Профиль студента не создан');
          return { account: rest, student };
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            throw new AccountExistsError();
          }
          throw err;
        }
      },
      findByAccountId: (accountId) => prisma.student.findUnique({ where: { accountId } }),
      findById: (id) => prisma.student.findUnique({ where: { id } }),
      list: () => prisma.student.findMany({ orderBy: { createdAt: 'desc' } }),
      async setStatus(id, status) {
        await prisma.student.update({ where: { id }, data: { status } });
      },

      update(id, input) {
        return prisma.student.update({
          where: { id },
          data: {
            fullNameEnc: encrypt(input.fullName),
            // Пустой телефон — это отсутствие телефона, а не шифротекст
            // пустой строки: иначе «не указан» и «указан пустым» стали бы
            // разными состояниями, и первое перестало бы находиться
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
          },
        });
      },

      async deleteByAccountId(accountId) {
        // Каскады в схеме уносят анкету, свайпы, отклики и переписку.
        // Журнал аудита остаётся: у него ссылка обнуляется, а не удаляется.
        await prisma.account.delete({ where: { id: accountId } });
      },
    },

    employers: {
      findByAccountId: (accountId) => prisma.employer.findUnique({ where: { accountId } }),
      findById: (id) => prisma.employer.findUnique({ where: { id } }),
      list: () => prisma.employer.findMany({ orderBy: { companyName: 'asc' } }),
    },

    vacancies: {
      listActive: () =>
        prisma.vacancy.findMany({ where: { isActive: true }, orderBy: { publishedAt: 'desc' } }),
      findById: (id) => prisma.vacancy.findUnique({ where: { id } }),
      findManyByIds: (ids) => prisma.vacancy.findMany({ where: { id: { in: ids } } }),
      listByEmployer: (employerId) =>
        prisma.vacancy.findMany({ where: { employerId }, orderBy: { publishedAt: 'desc' } }),
      async countAll() {
        const [active, total] = await Promise.all([
          prisma.vacancy.count({ where: { isActive: true } }),
          prisma.vacancy.count(),
        ]);
        return { active, total };
      },
      async syncFromCrm(items) {
        const outcome: SyncOutcome = { created: 0, updated: 0, deactivated: 0 };
        const seenCrmIds: string[] = [];

        for (const item of items) {
          seenCrmIds.push(item.crmId);
          const employer = await upsertEmployer(item);
          const data = vacancyData(item, employer.id);

          const existing = await prisma.vacancy.findUnique({
            where: { crmId: item.crmId },
            select: { id: true },
          });
          if (existing) {
            await prisma.vacancy.update({ where: { id: existing.id }, data });
            outcome.updated++;
          } else {
            await prisma.vacancy.create({ data: { ...data, crmId: item.crmId } });
            outcome.created++;
          }
        }

        // Пропавшее из выгрузки закрыто в CRM. Не удаляем — на вакансии
        // висят отклики; снимаем с публикации.
        const { count } = await prisma.vacancy.updateMany({
          where: { isActive: true, crmId: { not: null, notIn: seenCrmIds } },
          data: { isActive: false },
        });
        outcome.deactivated = count;

        return outcome;
      },
    },

    swipes: {
      create: ({ studentId, vacancyId, direction }) =>
        prisma.swipe.upsert({
          where: { studentId_vacancyId: { studentId, vacancyId } },
          create: { studentId, vacancyId, direction },
          update: { direction, createdAt: new Date() },
        }),
      listByStudent: (studentId, direction) =>
        prisma.swipe.findMany({
          where: { studentId, ...(direction ? { direction } : {}) },
          orderBy: { createdAt: 'desc' },
        }),
      async remove(studentId, vacancyId) {
        await prisma.swipe.deleteMany({ where: { studentId, vacancyId } });
      },
      async swipedVacancyIds(studentId) {
        const rows = await prisma.swipe.findMany({ where: { studentId }, select: { vacancyId: true } });
        return rows.map((r) => r.vacancyId);
      },
      async countByDirection() {
        const grouped = await prisma.swipe.groupBy({ by: ['direction'], _count: { _all: true } });
        return {
          right: grouped.find((g) => g.direction === 'RIGHT')?._count._all ?? 0,
          left: grouped.find((g) => g.direction === 'LEFT')?._count._all ?? 0,
        };
      },
    },

    applications: {
      upsert: ({ studentId, vacancyId }) =>
        prisma.application.upsert({
          where: { studentId_vacancyId: { studentId, vacancyId } },
          create: { studentId, vacancyId },
          // Повторный свайп вправо не должен обнулять статус: работодатель
          // мог уже позвать человека на собеседование.
          update: {},
        }),
      listByStudent: (studentId) =>
        prisma.application.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } }),
      listByVacancyIds: (vacancyIds) =>
        prisma.application.findMany({
          where: { vacancyId: { in: vacancyIds } },
          orderBy: { createdAt: 'desc' },
        }),
      listAll: () => prisma.application.findMany({ orderBy: { createdAt: 'desc' } }),
      findById: (id) => prisma.application.findUnique({ where: { id } }),
      async setStatus(id, status, note) {
        return prisma.application.update({
          where: { id },
          data: {
            status,
            statusChangedAt: new Date(),
            ...(note !== undefined ? { employerNote: note } : {}),
          },
        });
      },
      async removeByPair(studentId, vacancyId) {
        await prisma.application.deleteMany({ where: { studentId, vacancyId } });
      },
    },

    messages: {
      listByApplication: (applicationId) =>
        prisma.message.findMany({ where: { applicationId }, orderBy: { createdAt: 'asc' } }),
      async create({ applicationId, author, body }) {
        // Сообщение и отметка времени в отклике пишутся одной транзакцией:
        // разъехавшись, они дали бы диалог, который не всплывает в списке
        const [message] = await prisma.$transaction([
          prisma.message.create({ data: { applicationId, author, bodyEnc: encrypt(body) } }),
          prisma.application.update({ where: { id: applicationId }, data: { lastMessageAt: new Date() } }),
        ]);
        return message;
      },
      async markRead(applicationId, reader) {
        const { count } = await prisma.message.updateMany({
          where: { applicationId, author: { not: reader }, readAt: null },
          data: { readAt: new Date() },
        });
        return count;
      },
      async unreadFor(applicationIds, reader) {
        const out: Record<string, number> = {};
        for (const id of applicationIds) out[id] = 0;
        if (applicationIds.length === 0) return out;
        const grouped = await prisma.message.groupBy({
          by: ['applicationId'],
          where: { applicationId: { in: applicationIds }, author: { not: reader }, readAt: null },
          _count: { _all: true },
        });
        for (const g of grouped) out[g.applicationId] = g._count._all;
        return out;
      },
      async lastFor(applicationIds) {
        const out: Record<string, MessageRecord> = {};
        if (applicationIds.length === 0) return out;
        // Одним запросом по индексу [applicationId, createdAt]; последнее
        // сообщение каждой ветки выбираем в памяти — диалогов на экране
        // десятки, а не тысячи
        const rows = await prisma.message.findMany({
          where: { applicationId: { in: applicationIds } },
          orderBy: { createdAt: 'desc' },
        });
        for (const row of rows) if (!out[row.applicationId]) out[row.applicationId] = row;
        return out;
      },
    },

    accessCodes: {
      findByHash: (codeHash) => prisma.accessCode.findUnique({ where: { codeHash } }),
      async markUsed(id) {
        await prisma.accessCode.update({ where: { id }, data: { lastUsedAt: new Date() } });
      },
      issue: ({ accountId, codeHash, label, expiresAt }) =>
        prisma.accessCode.create({ data: { accountId, codeHash, label, expiresAt } }),
    },

    syncRuns: {
      start: (source) => prisma.syncRun.create({ data: { source } }),
      finish: (id, patch) =>
        prisma.syncRun.update({ where: { id }, data: { ...patch, finishedAt: new Date() } }),
      latest: () => prisma.syncRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      list: (limit) => prisma.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: limit }),
    },

    audit: {
      async log(entry) {
        await prisma.auditLog.create({
          data: {
            accountId: entry.accountId,
            actorLabel: entry.actorLabel,
            action: entry.action,
            entity: entry.entity,
            entityId: entry.entityId,
            ip: entry.ip,
            userAgent: entry.userAgent,
            meta: (entry.meta ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });
      },
      async list(limit) {
        const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
        return rows.map((r) => ({ ...r, meta: (r.meta ?? null) as Record<string, unknown> | null }));
      },
    },
  };
}

async function upsertEmployer(item: CrmVacancyInput) {
  return prisma.employer.upsert({
    where: { crmClientId: item.crmClientId },
    update: { companyName: item.companyName, contactName: item.contactName },
    create: {
      companyName: item.companyName,
      contactName: item.contactName,
      crmClientId: item.crmClientId,
      account: {
        create: {
          role: 'EMPLOYER',
          emailEnc: encrypt(item.contactEmail),
          emailHash: blindIndex(item.contactEmail),
        },
      },
    },
  });
}

function vacancyData(item: CrmVacancyInput, employerId: string) {
  return {
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
    syncedAt: new Date(),
  };
}
