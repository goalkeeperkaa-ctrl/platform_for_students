import 'server-only';
import { Prisma } from '@prisma/client';
import { InnExistsError } from './memory';
import { blindIndex, encrypt } from '@/lib/security/crypto';
import { hashPassword } from '@/lib/security/password';
import { readCompanyProfile } from '@/lib/company';
import { readPortfolio } from '@/lib/portfolio';
import { readApprovedContent, readVacancyMedia } from '@/lib/vacancy';
import { prisma } from './prisma-client';
import { AccountExistsError } from './memory';
import type { CrmVacancyInput, DataStore, MessageRecord, SyncOutcome } from './types';

/**
 * Студент из строки базы.
 *
 * Портфолио лежит в JSON, и Prisma отдаёт его как произвольное значение.
 * Здесь оно приводится к форме, которую ждёт остальной код: без этого
 * одна поправленная руками строка роняла бы кабинет работодателя.
 */
function toStudentRecord<T extends Parameters<typeof readPortfolio>[0]>(row: T) {
  return { ...row, ...readPortfolio(row) };
}

/**
 * Компания из строки базы: соцсети из JSON и пути к картинкам приводятся
 * к проверенной форме — чужой путь к файлу отсюда не выйдет наружу.
 */
function toEmployerRecord<T extends Parameters<typeof readCompanyProfile>[0]>(row: T) {
  return { ...row, ...readCompanyProfile(row) };
}

/** Поле уникального ограничения из ошибки P2002: почта или ИНН. */
function uniqueTarget(err: Prisma.PrismaClientKnownRequestError): string {
  const target = err.meta?.target;
  return Array.isArray(target) ? target.join(',') : String(target ?? '');
}

/** Значение для JSON-колонки; undefined оставляет колонку как есть. */
function json(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

/**
 * Вакансия из строки базы: фото — только файлы компании, видео — только
 * http(s), снимок одобренной версии — проверенный схемой или null.
 */
function toVacancyRecord<T extends Parameters<typeof readVacancyMedia>[0] & { approvedContent: unknown }>(
  row: T,
): Omit<T, 'approvedContent'> & { approvedContent: ReturnType<typeof readApprovedContent> } {
  return { ...readVacancyMedia(row), approvedContent: readApprovedContent(row.approvedContent) };
}

/**
 * Вакансия, которую видит студент. Условие — в запросе, а не фильтром после
 * выборки: иначе лента вытягивала бы черновики всех компаний, чтобы тут же
 * их выбросить. То же правило — isVacancyVisible в lib/vacancy.ts.
 */
const VISIBLE_VACANCY: Prisma.VacancyWhereInput = {
  isActive: true,
  status: 'PUBLISHED',
  employer: { moderationStatus: 'APPROVED' },
};

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
      async markTourSeen(id) {
        await prisma.account.update({ where: { id }, data: { tourSeenAt: new Date() } });
      },
      async markEmailVerified(id) {
        await prisma.account.updateMany({ where: { id, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
      },
      async setPassword(id, passwordHash) {
        await prisma.account.update({ where: { id }, data: { passwordHash } });
      },
      async setNotifyEmail(id, enabled) {
        await prisma.account.update({ where: { id }, data: { notifyEmail: enabled } });
      },
      createStaff: (email) =>
        prisma.account.create({
          data: { role: 'ADMIN', emailEnc: encrypt(email), emailHash: blindIndex(email), emailVerifiedAt: new Date() },
        }),
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
              termsVersion: input.termsVersion,
              termsAcceptedAt: new Date(),
              marketingConsentAt: input.marketingConsent ? new Date() : null,
              student: {
                create: {
                  fullNameEnc: encrypt(input.fullName),
                  phoneEnc: input.phone ? encrypt(input.phone) : null,
                  gender: input.gender,
                  birthYear: input.birthYear,
                  birthDateEnc: encrypt(input.birthDate),
                  photoUrl: input.photoUrl,
                  resumeUrl: input.resumeUrl,
                  resumeName: input.resumeName,
                  university: input.university,
                  speciality: input.speciality,
                  studyYear: input.studyYear,
                  institutionId: input.institutionId,
                  city: input.city,
                  workDays: input.workDays,
                  hoursPerWeek: input.hoursPerWeek,
                  skills: input.skills,
                  about: input.about,
                  lookingFor: input.lookingFor,
                  consentVersion: input.consentVersion,
                  consentIp: input.consentIp,
                },
              },
            },
            include: { student: true },
          });
          const { student, ...rest } = account;
          if (!student) throw new Error('Профиль студента не создан');
          return { account: rest, student: toStudentRecord(student) };
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            // Уникальных полей два — почта и ИНН компании: отличаем по полю
            throw uniqueTarget(err).includes('inn') ? new InnExistsError() : new AccountExistsError();
          }
          throw err;
        }
      },
      async findByAccountId(accountId) {
        const row = await prisma.student.findUnique({ where: { accountId } });
        return row ? toStudentRecord(row) : null;
      },
      async findById(id) {
        const row = await prisma.student.findUnique({ where: { id } });
        return row ? toStudentRecord(row) : null;
      },
      async list() {
        const rows = await prisma.student.findMany({ orderBy: { createdAt: 'desc' } });
        return rows.map(toStudentRecord);
      },
      async setStatus(id, status) {
        await prisma.student.update({ where: { id }, data: { status } });
      },
      async setStudyVerified(id, verified) {
        const exists = await prisma.student.findUnique({ where: { id }, select: { id: true } });
        if (!exists) return null;
        const row = await prisma.student.update({
          where: { id },
          data: {
            studyVerified: verified,
            studyVerifiedAt: verified ? new Date() : null,
            // Подтверждена — справка больше не нужна, как и причина прошлого отказа
            ...(verified ? { studyDocUrl: null, studyDocName: null, studyDocAt: null, studyReviewNote: null } : {}),
          },
        });
        return toStudentRecord(row);
      },
      async setStudyDocument(id, doc) {
        const exists = await prisma.student.findUnique({ where: { id }, select: { id: true } });
        if (!exists) return null;
        const row = await prisma.student.update({
          where: { id },
          data: doc
            ? { studyDocUrl: doc.url, studyDocName: doc.name, studyDocAt: new Date(), studyReviewNote: null }
            : { studyDocUrl: null, studyDocName: null, studyDocAt: null },
        });
        return toStudentRecord(row);
      },
      async rejectStudy(id, note) {
        const exists = await prisma.student.findUnique({ where: { id }, select: { id: true } });
        if (!exists) return null;
        const row = await prisma.student.update({
          where: { id },
          data: {
            studyVerified: false,
            studyVerifiedAt: null,
            studyDocUrl: null,
            studyDocName: null,
            studyDocAt: null,
            studyReviewNote: note,
          },
        });
        return toStudentRecord(row);
      },

      async update(id, input) {
        const row = await prisma.student.update({
          where: { id },
          data: {
            fullNameEnc: encrypt(input.fullName),
            // Пустой телефон — это отсутствие телефона, а не шифротекст
            // пустой строки: иначе «не указан» и «указан пустым» стали бы
            // разными состояниями, и первое перестало бы находиться
            phoneEnc: input.phone ? encrypt(input.phone) : null,
            gender: input.gender,
            birthYear: input.birthYear,
            birthDateEnc: encrypt(input.birthDate),
            photoUrl: input.photoUrl,
            resumeUrl: input.resumeUrl,
            resumeName: input.resumeName,
            university: input.university,
            speciality: input.speciality,
            studyYear: input.studyYear,
            institutionId: input.institutionId,
            city: input.city,
            workDays: input.workDays,
            hoursPerWeek: input.hoursPerWeek,
            skills: input.skills,
            about: input.about,
            // Портфолио: undefined — «не менять», Prisma такие поля пропускает
            lookingFor: input.lookingFor,
            goals: input.goals,
            projects: json(input.projects),
            achievements: json(input.achievements),
            activities: json(input.activities),
            hobbies: input.hobbies,
            links: json(input.links),
            videoUrl: input.videoUrl,
            // Подтверждение учёбы снимает только явное false — сменился вуз
            ...(input.studyVerified === false ? { studyVerified: false, studyVerifiedAt: null } : {}),
          },
        });
        return toStudentRecord(row);
      },

      async deleteByAccountId(accountId) {
        // Каскады в схеме уносят анкету, свайпы, отклики и переписку.
        // Журнал аудита остаётся: у него ссылка обнуляется, а не удаляется.
        await prisma.account.delete({ where: { id: accountId } });
      },
    },

    institutions: {
      list: () => prisma.institution.findMany({ orderBy: [{ city: 'asc' }, { name: 'asc' }] }),
      findById: (id) => prisma.institution.findUnique({ where: { id } }),
      findBySlug: (slug) => prisma.institution.findUnique({ where: { slug } }),
    },

    employers: {
      async findByAccountId(accountId) {
        const row = await prisma.employer.findUnique({ where: { accountId } });
        return row ? toEmployerRecord(row) : null;
      },
      async findById(id) {
        const row = await prisma.employer.findUnique({ where: { id } });
        return row ? toEmployerRecord(row) : null;
      },
      async findByInn(inn) {
        const row = await prisma.employer.findUnique({ where: { inn } });
        return row ? toEmployerRecord(row) : null;
      },
      async list() {
        const rows = await prisma.employer.findMany({ orderBy: { companyName: 'asc' } });
        return rows.map(toEmployerRecord);
      },
      async createWithAccount(input) {
        const emailHash = blindIndex(input.email);
        const passwordHash = await hashPassword(input.password);
        try {
          const account = await prisma.account.create({
            data: {
              role: 'EMPLOYER',
              emailEnc: encrypt(input.email),
              emailHash,
              passwordHash,
              termsVersion: input.termsVersion,
              termsAcceptedAt: new Date(),
              marketingConsentAt: input.marketingConsent ? new Date() : null,
              employer: {
                create: {
                  companyName: input.companyName,
                  contactName: input.contactName,
                  city: input.city,
                  inn: input.inn,
                  phoneEnc: encrypt(input.phone),
                  // Статус ставит хранилище, а не форма: компания из запроса
                  // не может объявить себя одобренной
                  moderationStatus: 'PENDING',
                  consentVersion: input.consentVersion,
                  consentAt: new Date(),
                },
              },
            },
            include: { employer: true },
          });
          const { employer, ...rest } = account;
          if (!employer) throw new Error('Компания не создана');
          return { account: rest, employer: toEmployerRecord(employer) };
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            // Уникальных полей два — почта и ИНН. Имя поля в ошибке вложенной
            // записи Prisma не сообщает («not available»), поэтому спрашиваем
            // базу — в том же порядке, что и хранилище в памяти: сначала почта
            const emailTaken = (await prisma.account.count({ where: { emailHash } })) > 0;
            throw emailTaken ? new AccountExistsError() : new InnExistsError();
          }
          throw err;
        }
      },
      async updateProfile(id, input) {
        const row = await prisma.employer.update({
          where: { id },
          data: {
            companyName: input.companyName,
            contactName: input.contactName,
            logoUrl: input.logoUrl,
            about: input.about,
            website: input.website,
            city: input.city,
            socials: json(input.socials),
            photos: input.photos,
            videoUrl: input.videoUrl,
            ...(input.phone !== undefined ? { phoneEnc: input.phone ? encrypt(input.phone) : null } : {}),
            ...(input.inn !== undefined ? { inn: input.inn } : {}),
          },
        }).catch((err: unknown) => {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new InnExistsError();
          throw err;
        });
        return toEmployerRecord(row);
      },
      async setModeration(id, { status, note }) {
        const row = await prisma.employer.update({
          where: { id },
          data: {
            moderationStatus: status,
            moderationNote: note,
            // Дата решения; возврат на проверку решением не является
            moderatedAt: status === 'PENDING' ? null : new Date(),
          },
        });
        return toEmployerRecord(row);
      },
      async ensureForCrmClient(input) {
        const row = await prisma.employer.upsert({
          where: { crmClientId: input.crmClientId },
          // Ничего не меняем: имя и контакт компании ведёт синк вакансий
          // из CRM, а не то, кто из сотрудников клиента зашёл первым
          update: {},
          create: {
            companyName: input.companyName,
            contactName: input.contactName,
            crmClientId: input.crmClientId,
            account: {
              create: {
                role: 'EMPLOYER',
                emailEnc: encrypt(input.contactEmail),
                emailHash: blindIndex(input.contactEmail),
                // Клиента заводит агентство по договору — его почта уже проверена
                emailVerifiedAt: new Date(),
              },
            },
          },
        });
        return toEmployerRecord(row);
      },
      async requestCrmLink(id, note) {
        const row = await prisma.employer
          .update({ where: { id }, data: { crmLinkRequestedAt: new Date(), crmLinkNote: note } })
          .catch(() => null);
        return row ? toEmployerRecord(row) : null;
      },
      async listCrmLinkRequests() {
        const rows = await prisma.employer.findMany({
          where: { crmLinkRequestedAt: { not: null }, crmClientId: null },
          orderBy: { crmLinkRequestedAt: 'asc' },
        });
        return rows.map(toEmployerRecord);
      },
      async resolveCrmLink(id, crmClientId) {
        const row = await prisma.employer
          .update({ where: { id }, data: { crmClientId, crmLinkRequestedAt: null, crmLinkNote: null } })
          .catch(() => null);
        return row ? toEmployerRecord(row) : null;
      },
      async rejectCrmLink(id, note) {
        const row = await prisma.employer
          .update({ where: { id }, data: { crmLinkRequestedAt: null, crmLinkNote: note } })
          .catch(() => null);
        return row ? toEmployerRecord(row) : null;
      },
    },

    vacancies: {
      async listActive() {
        const rows = await prisma.vacancy.findMany({ where: VISIBLE_VACANCY, orderBy: { publishedAt: 'desc' } });
        return rows.map(toVacancyRecord);
      },
      async findById(id) {
        const row = await prisma.vacancy.findUnique({ where: { id } });
        return row ? toVacancyRecord(row) : null;
      },
      async findManyByIds(ids) {
        const rows = await prisma.vacancy.findMany({ where: { id: { in: ids } } });
        return rows.map(toVacancyRecord);
      },
      async listByEmployer(employerId) {
        const rows = await prisma.vacancy.findMany({ where: { employerId }, orderBy: { publishedAt: 'desc' } });
        return rows.map(toVacancyRecord);
      },
      async listByStatus(status) {
        const rows = await prisma.vacancy.findMany({
          where: { status },
          orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
        });
        return rows.map(toVacancyRecord);
      },
      async listByPhoto(url) {
        const rows = await prisma.vacancy.findMany({ where: { photos: { has: url } } });
        return rows.map(toVacancyRecord);
      },
      async listByVideo(url) {
        const rows = await prisma.vacancy.findMany({ where: { videoUrl: url } });
        return rows.map(toVacancyRecord);
      },
      async create(input) {
        return toVacancyRecord(await prisma.vacancy.create({ data: input }));
      },
      async update(id, patch) {
        return toVacancyRecord(
          await prisma.vacancy.update({
            where: { id },
            data: { ...patch, approvedContent: json(patch.approvedContent) },
          }),
        );
      },
      async countAll() {
        const [active, total] = await Promise.all([
          prisma.vacancy.count({ where: VISIBLE_VACANCY }),
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
      async createInvite({ studentId, vacancyId }) {
        try {
          return await prisma.application.create({
            data: { studentId, vacancyId, status: 'INVITED', statusChangedAt: new Date() },
          });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
          throw err;
        }
      },
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
      listUnreadBefore: (before) =>
        prisma.message.findMany({ where: { readAt: null, createdAt: { lt: before } }, orderBy: { createdAt: 'asc' } }),
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

    authTokens: {
      async issue({ accountId, kind, tokenHash, expiresAt }) {
        const [, record] = await prisma.$transaction([
          prisma.authToken.deleteMany({ where: { accountId, kind, usedAt: null } }),
          prisma.authToken.create({ data: { accountId, kind, tokenHash, expiresAt } }),
        ]);
        return record;
      },
      latest: (accountId, kind) =>
        prisma.authToken.findFirst({ where: { accountId, kind, usedAt: null }, orderBy: { createdAt: 'desc' } }),
      findActiveByHash: (kind, tokenHash) => prisma.authToken.findFirst({ where: { kind, tokenHash, usedAt: null } }),
      async recordFailure(id) {
        const row = await prisma.authToken.update({ where: { id }, data: { attempts: { increment: 1 } } });
        return row.attempts;
      },
      async consume(id) {
        // Условие usedAt: null в самом запросе: два одновременных ввода
        // одного кода не должны оба пройти
        const { count } = await prisma.authToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } });
        return count === 1;
      },
    },

    notifications: {
      async claim(accountId, key) {
        try {
          await prisma.notificationLog.create({ data: { accountId, key } });
          return true;
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
          throw err;
        }
      },
    },

    staffTickets: {
      async consume(jti) {
        // Билет живёт минуту — отметки старше суток хранить незачем
        await prisma.staffTicket.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } });
        try {
          await prisma.staffTicket.create({ data: { jti } });
          return true;
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
          throw err;
        }
      },
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

    events: {
      async log(entry) {
        await prisma.analyticsEvent.create({ data: entry });
      },
      async countByType(types) {
        const rows = await prisma.analyticsEvent.groupBy({
          by: ['type'],
          where: { type: { in: types } },
          _count: { _all: true },
        });
        return Object.fromEntries(rows.map((row) => [row.type, row._count._all]));
      },
      list: ({ types, limit }) =>
        prisma.analyticsEvent.findMany({
          where: types ? { type: { in: types } } : undefined,
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
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
          // Клиента заводит агентство по договору — его почта уже проверена
          emailVerifiedAt: new Date(),
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
    address: item.address ?? null,
    addressDetails: item.addressDetails ?? null,
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
