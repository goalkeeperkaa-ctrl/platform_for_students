import { CRM_VACANCIES } from '@/lib/db/seed-data';
import type { VacancyDTO } from '@/lib/types';

/**
 * Витринные карточки для лендинга.
 *
 * Берутся из той же выгрузки, что и продукт, но без обращения к базе:
 * главная страница должна открываться, даже когда БД недоступна, и
 * отдаваться статикой. Совпадение здесь не считается — считать его не
 * с чем, гость ещё не заполнил профиль.
 */
export function showcaseVacancies(count = 5): VacancyDTO[] {
  return CRM_VACANCIES.filter((v) => v.isActive)
    .slice(0, count)
    .map((item, index) => ({
      id: `showcase-${index}`,
      title: item.title,
      company: item.companyName,
      companyId: null,
      companyLogoUrl: null,
      summary: item.summary,
      responsibilities: item.responsibilities,
      requirements: item.requirements,
      perks: item.perks,
      learnings: [],
      team: null,
      photos: [],
      videoUrl: null,
      salaryFrom: item.salaryFrom,
      salaryTo: item.salaryTo,
      salaryPeriod: item.salaryPeriod,
      city: item.city,
      district: item.district,
      address: null,
      addressDetails: null,
      workFormat: item.workFormat,
      employmentType: item.employmentType,
      shiftDays: item.shiftDays,
      hoursPerWeek: item.hoursPerWeek,
      tags: item.tags,
      isHot: item.isHot,
      publishedAt: item.publishedAt.toISOString(),
      matchScore: null,
      matchReasons: [],
    }));
}

/** Компании, с которыми работает агентство — для бегущей строки. */
export function showcaseCompanies(): string[] {
  return Array.from(new Set(CRM_VACANCIES.map((v) => v.companyName)));
}
