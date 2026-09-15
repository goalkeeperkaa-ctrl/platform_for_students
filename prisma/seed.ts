import { Prisma, PrismaClient } from '@prisma/client';
import { blindIndex, encrypt, hashToken } from '../lib/security/crypto';
import { hashPassword } from '../lib/security/password';
import {
  CONSENT_VERSION,
  CRM_VACANCIES,
  DEMO_APPLICATION_FUNNEL,
  DEMO_CHAT,
  DEMO_COMPANY_PROFILES,
  DEMO_CREDENTIALS,
  DEMO_EXTRA_STUDENTS,
  DEMO_INSTITUTIONS,
  DEMO_STUDENT_PROFILE,
  DEMO_VACANCY_EXTRAS,
  extraStudentEmail,
  extraStudentPhone,
} from '../lib/db/seed-data';

/**
 * Наполнение базы.
 *
 * Берёт те же фикстуры, что и демо-режим в памяти: расхождение между
 * «как выглядит на демо» и «как выглядит на базе» — источник багов,
 * которые находятся только на проде.
 *
 * Идемпотентно: повторный запуск обновляет, а не дублирует.
 */
const prisma = new PrismaClient();

/** Портфолио — JSON-колонки; интерфейсы TypeScript Prisma принимает только приведёнными. */
const asJson = (value: unknown) => value as Prisma.InputJsonValue;

async function main() {
  console.log('Заполняем базу…');

  // --- Работодатели и вакансии ---
  const employerByCrmId = new Map<string, string>();

  for (const item of CRM_VACANCIES) {
    let employerId = employerByCrmId.get(item.crmClientId);

    if (!employerId) {
      const employer = await prisma.employer.upsert({
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
              emailVerifiedAt: new Date(),
            },
          },
        },
      });
      employerId = employer.id;
      employerByCrmId.set(item.crmClientId, employerId);
    }

    const data = {
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

    await prisma.vacancy.upsert({
      where: { crmId: item.crmId },
      update: data,
      create: { ...data, crmId: item.crmId },
    });
  }
  console.log(`  вакансий: ${CRM_VACANCIES.length}, работодателей: ${employerByCrmId.size}`);

  // --- Страница демо-компании ---
  for (const [crmClientId, profile] of Object.entries(DEMO_COMPANY_PROFILES)) {
    await prisma.employer.updateMany({ where: { crmClientId }, data: profile });
  }

  // --- Карточка вакансии v0.1 у демо-вакансий ---
  for (const [crmId, extra] of Object.entries(DEMO_VACANCY_EXTRAS)) {
    await prisma.vacancy.updateMany({ where: { crmId }, data: extra });
  }

  // --- Код доступа работодателя ---
  const demoEmployer = await prisma.employer.findUnique({
    where: { crmClientId: DEMO_CREDENTIALS.employerCrmClientId },
  });
  if (demoEmployer) {
    const codeHash = hashToken(DEMO_CREDENTIALS.employerCode);
    await prisma.accessCode.upsert({
      where: { codeHash },
      update: {},
      create: { accountId: demoEmployer.accountId, codeHash, label: 'Демо-доступ из CRM' },
    });
    console.log(`  код доступа работодателя: ${DEMO_CREDENTIALS.employerCode}`);
  }

  // --- Администратор ---
  await upsertAccountWithPassword(
    DEMO_CREDENTIALS.admin.email,
    DEMO_CREDENTIALS.admin.password,
    'ADMIN',
  );
  console.log(`  админ: ${DEMO_CREDENTIALS.admin.email}`);

  // --- Справочник вузов ---
  // Студенты связываются с ним по названию, как и в демо-хранилище
  const institutionBySchool = new Map<string, string>();
  for (const item of DEMO_INSTITUTIONS) {
    const row = await prisma.institution.upsert({ where: { slug: item.slug }, update: item, create: item });
    institutionBySchool.set(row.name, row.id);
    if (row.shortName) institutionBySchool.set(row.shortName, row.id);
  }
  console.log(`  вузов в справочнике: ${DEMO_INSTITUTIONS.length}`);

  // --- Демо-студент ---
  const studentAccount = await upsertAccountWithPassword(
    DEMO_CREDENTIALS.student.email,
    DEMO_CREDENTIALS.student.password,
    'STUDENT',
  );

  const profile = {
    fullNameEnc: encrypt(DEMO_STUDENT_PROFILE.fullName),
    phoneEnc: encrypt(DEMO_STUDENT_PROFILE.phone),
    gender: DEMO_STUDENT_PROFILE.gender,
    birthYear: DEMO_STUDENT_PROFILE.birthYear,
    birthDateEnc: encrypt(DEMO_STUDENT_PROFILE.birthDate),
    university: DEMO_STUDENT_PROFILE.university,
    speciality: DEMO_STUDENT_PROFILE.speciality,
    studyYear: DEMO_STUDENT_PROFILE.studyYear,
    institutionId: institutionBySchool.get(DEMO_STUDENT_PROFILE.university) ?? null,
    studyVerified: true,
    studyVerifiedAt: new Date(),
    city: DEMO_STUDENT_PROFILE.city,
    workDays: [...DEMO_STUDENT_PROFILE.workDays],
    hoursPerWeek: DEMO_STUDENT_PROFILE.hoursPerWeek,
    skills: [...DEMO_STUDENT_PROFILE.skills],
    about: DEMO_STUDENT_PROFILE.about,
    lookingFor: [...DEMO_STUDENT_PROFILE.lookingFor],
    goals: DEMO_STUDENT_PROFILE.goals,
    projects: asJson(DEMO_STUDENT_PROFILE.projects),
    achievements: asJson(DEMO_STUDENT_PROFILE.achievements),
    activities: asJson(DEMO_STUDENT_PROFILE.activities),
    hobbies: DEMO_STUDENT_PROFILE.hobbies,
    links: asJson(DEMO_STUDENT_PROFILE.links),
    videoUrl: DEMO_STUDENT_PROFILE.videoUrl,
    consentVersion: CONSENT_VERSION,
    consentIp: '127.0.0.1',
  };

  const demoStudent = await prisma.student.upsert({
    where: { accountId: studentAccount.id },
    update: profile,
    create: { accountId: studentAccount.id, ...profile },
  });
  console.log(`  студент: ${DEMO_CREDENTIALS.student.email}`);

  // --- Остальные студенты ---
  // Порядок важен: демо-студент первый, дальше по списку. От него зависит,
  // какому отклику достанется переписка из DEMO_CHAT.
  const students = [demoStudent.id];

  for (const [i, extra] of DEMO_EXTRA_STUDENTS.entries()) {
    const account = await upsertAccountWithPassword(
      extraStudentEmail(i),
      DEMO_CREDENTIALS.student.password,
      'STUDENT',
    );
    const data = {
      ...profile,
      fullNameEnc: encrypt(extra.fullName),
      phoneEnc: encrypt(extraStudentPhone(i)),
      gender: i % 2 === 0 ? ('MALE' as const) : ('FEMALE' as const),
      birthYear: extra.birthYear,
      birthDateEnc: encrypt(extra.birthDate),
      university: extra.university,
      speciality: extra.speciality,
      studyYear: 2 + (i % 3),
      institutionId: institutionBySchool.get(extra.university) ?? null,
      studyVerified: i % 2 === 0,
      studyVerifiedAt: i % 2 === 0 ? new Date() : null,
      skills: [...extra.skills],
      about: null,
      // Портфолио своё, пустое: иначе через ...profile всем досталось бы
      // портфолио демо-студента
      lookingFor: [],
      goals: null,
      projects: asJson([]),
      achievements: asJson([]),
      activities: asJson([]),
      hobbies: null,
      links: asJson([]),
      videoUrl: null,
      status: extra.status,
    };
    const created = await prisma.student.upsert({
      where: { accountId: account.id },
      update: data,
      create: { accountId: account.id, ...data },
    });
    students.push(created.id);
  }
  console.log(`  всего студентов: ${students.length}`);

  // --- Отклики и пропуски ---
  // Без них «Отклики», «Пропущенные», кабинет работодателя и статистика
  // администратора после db:seed оставались пустыми, хотя в демо-режиме
  // были заполнены. Раскладка повторяет хранилище в памяти один в один.
  const vacancies = await prisma.vacancy.findMany({
    where: { crmId: { in: CRM_VACANCIES.map((v) => v.crmId) } },
    select: { id: true, crmId: true },
  });
  const ordered = CRM_VACANCIES.map((v) => vacancies.find((x) => x.crmId === v.crmId)).filter(
    (v): v is { id: string; crmId: string } => Boolean(v),
  );

  const applications: string[] = [];

  for (const [idx, studentId] of students.entries()) {
    const vacancy = ordered[(idx * 3) % ordered.length];
    if (!vacancy) continue;
    const createdAt = new Date(Date.now() - (idx + 1) * 3_600_000 * 6);
    const key = { studentId_vacancyId: { studentId, vacancyId: vacancy.id } };

    await prisma.swipe.upsert({
      where: key,
      update: { direction: 'RIGHT' },
      create: { studentId, vacancyId: vacancy.id, direction: 'RIGHT', createdAt },
    });

    const status = DEMO_APPLICATION_FUNNEL[idx % DEMO_APPLICATION_FUNNEL.length];
    const application = await prisma.application.upsert({
      where: key,
      update: { status },
      create: { studentId, vacancyId: vacancy.id, status, statusChangedAt: createdAt, createdAt },
    });
    applications.push(application.id);

    // Один пропуск на студента, чтобы раздел «Пропущенные» тоже был живым
    const skipped = ordered[(idx * 3 + 1) % ordered.length];
    if (skipped) {
      await prisma.swipe.upsert({
        where: { studentId_vacancyId: { studentId, vacancyId: skipped.id } },
        update: { direction: 'LEFT' },
        create: {
          studentId,
          vacancyId: skipped.id,
          direction: 'LEFT',
          createdAt: new Date(createdAt.getTime() + 60_000),
        },
      });
    }
  }
  console.log(`  откликов: ${applications.length}`);

  // --- Переписка ---
  // У сообщений нет естественного ключа, поэтому идемпотентность здесь
  // другая: в диалог, где уже что-то есть, сид не лезет.
  // Проверка одна на диалог, а не на строку: иначе первое же записанное
  // сообщение отсекало бы остальные реплики того же разговора.
  const byApplication = new Map<string, typeof DEMO_CHAT>();
  for (const line of DEMO_CHAT) {
    const applicationId = applications[line.applicationIndex];
    if (!applicationId) continue;
    byApplication.set(applicationId, [...(byApplication.get(applicationId) ?? []), line]);
  }

  let written = 0;
  for (const [applicationId, lines] of byApplication) {
    if (await prisma.message.count({ where: { applicationId } })) continue;

    let last: Date | null = null;
    for (const line of lines) {
      const createdAt = new Date(Date.now() - line.minutesAgo * 60_000);
      await prisma.message.create({
        data: {
          applicationId,
          author: line.author,
          bodyEnc: encrypt(line.body),
          readAt: line.read ? new Date(createdAt.getTime() + 90_000) : null,
          createdAt,
        },
      });
      if (!last || last < createdAt) last = createdAt;
      written++;
    }
    await prisma.application.update({
      where: { id: applicationId },
      data: { lastMessageAt: last },
    });
  }
  console.log(`  сообщений: ${written}`);

  console.log('Готово.');
}

async function upsertAccountWithPassword(
  email: string,
  password: string,
  role: 'ADMIN' | 'STUDENT',
) {
  const emailHash = blindIndex(email);
  const passwordHash = await hashPassword(password);
  return prisma.account.upsert({
    where: { emailHash },
    update: { passwordHash, isActive: true, emailVerifiedAt: new Date() },
    create: { role, emailEnc: encrypt(email), emailHash, passwordHash, emailVerifiedAt: new Date() },
  });
}

main()
  .catch((error) => {
    console.error('Не удалось заполнить базу:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
