import 'server-only';
import { decryptSafe } from '@/lib/security/crypto';
import { ageFromIso, todayInMoscow } from '@/lib/age';
import { plural } from '@/lib/utils';
import { WEEKDAY_LABEL, type VacancyDTO, type StudentProfileDTO } from '@/lib/types';
import type { StudentRecord, VacancyRecord, EmployerRecord } from './types';

/** Совпадение профиля студента с вакансией. */
export interface MatchResult {
  score: number;
  reasons: string[];
}

/**
 * Оценка совпадения.
 *
 * Веса подобраны от обратного: студент отказывается от вакансии прежде
 * всего из-за графика, а не из-за навыков — поэтому дни весят больше
 * всего. Причины возвращаются текстом: голое «87%» ничего не объясняет,
 * а «совпадают 3 из 4 ваших дней» — объясняет.
 */
export function scoreMatch(student: StudentRecord | null, vacancy: VacancyRecord): MatchResult {
  if (!student) return { score: 0, reasons: [] };

  const reasons: string[] = [];
  let score = 0;

  // График — 34 балла
  const overlap = student.workDays.filter((d) => vacancy.shiftDays.includes(d));
  if (student.workDays.length > 0) {
    const ratio = overlap.length / student.workDays.length;
    score += Math.round(ratio * 34);
    if (overlap.length === student.workDays.length && overlap.length > 0) {
      reasons.push('Подходит под все ваши дни');
    } else if (overlap.length >= 2) {
      reasons.push(
        `Совпадает ${overlap.length} из ${student.workDays.length} ваших ${plural(
          student.workDays.length,
          'дня',
          'дней',
          'дней',
        )}: ${overlap.map((d) => WEEKDAY_LABEL[d]).join(', ')}`,
      );
    }
  }

  // Навыки против тегов и требований — 26 баллов
  const haystack = [...vacancy.tags, ...vacancy.requirements, vacancy.title, vacancy.summary]
    .join(' ')
    .toLowerCase();
  const matchedSkills = student.skills.filter((s) => s.length > 2 && haystack.includes(s.toLowerCase()));
  if (student.skills.length > 0) {
    score += Math.min(26, matchedSkills.length * 13);
    if (matchedSkills.length > 0) {
      reasons.push(`Ваши навыки в требованиях: ${matchedSkills.slice(0, 3).join(', ')}`);
    }
  }

  // Город — 14 баллов. Удалёнка снимает вопрос географии вовсе.
  if (vacancy.workFormat === 'REMOTE') {
    score += 14;
    reasons.push('Удалённо — география не важна');
  } else if (student.city && vacancy.city.toLowerCase() === student.city.toLowerCase()) {
    score += 14;
  }

  // Нагрузка — 16 баллов. Штраф только за перегруз: недобор терпим.
  if (student.hoursPerWeek && vacancy.hoursPerWeek) {
    const diff = vacancy.hoursPerWeek - student.hoursPerWeek;
    if (diff <= 0) {
      score += 16;
      if (diff <= -6) reasons.push('Нагрузка ниже вашего лимита');
    } else if (diff <= 6) {
      score += 9;
    }
  } else {
    score += 8;
  }

  // Свежесть — 10 баллов. Вакансия недельной давности ещё живая,
  // месячной — почти наверняка уже закрыта.
  const ageDays = (Date.now() - vacancy.publishedAt.getTime()) / 86_400_000;
  if (ageDays <= 3) {
    score += 10;
    if (ageDays <= 1) reasons.push('Опубликована сегодня');
  } else if (ageDays <= 10) {
    score += 6;
  }

  return { score: Math.max(0, Math.min(100, score)), reasons: reasons.slice(0, 3) };
}

export function toVacancyDTO(
  vacancy: VacancyRecord,
  employer: Pick<EmployerRecord, 'companyName' | 'logoUrl'> | null,
  match?: MatchResult,
): VacancyDTO {
  return {
    id: vacancy.id,
    title: vacancy.title,
    company: employer?.companyName ?? 'Работодатель',
    companyId: vacancy.employerId,
    companyLogoUrl: employer?.logoUrl ?? null,
    summary: vacancy.summary,
    responsibilities: vacancy.responsibilities,
    requirements: vacancy.requirements,
    perks: vacancy.perks,
    learnings: vacancy.learnings,
    team: vacancy.team,
    photos: vacancy.photos,
    videoUrl: vacancy.videoUrl,
    salaryFrom: vacancy.salaryFrom,
    salaryTo: vacancy.salaryTo,
    salaryPeriod: vacancy.salaryPeriod,
    city: vacancy.city,
    district: vacancy.district,
    address: vacancy.address,
    addressDetails: vacancy.addressDetails,
    workFormat: vacancy.workFormat,
    employmentType: vacancy.employmentType,
    shiftDays: vacancy.shiftDays,
    hoursPerWeek: vacancy.hoursPerWeek,
    tags: vacancy.tags,
    isHot: vacancy.isHot,
    publishedAt: vacancy.publishedAt.toISOString(),
    matchScore: match ? match.score : null,
    matchReasons: match ? match.reasons : [],
  };
}

/**
 * Профиль студента с расшифрованными ПДн.
 *
 * `includeContacts` — не косметика, а граница доступа: работодатель видит
 * телефон и почту только после того, как студент сам откликнулся на его
 * вакансию. В ленте и в статистике контактов быть не должно.
 */
export function toStudentDTO(
  student: StudentRecord,
  email: string,
  options: { includeContacts: boolean; includeBirthDate?: boolean } = { includeContacts: true },
): StudentProfileDTO {
  return {
    id: student.id,
    fullName: decryptSafe(student.fullNameEnc, 'Без имени'),
    email: options.includeContacts ? email : '',
    phone: options.includeContacts ? decryptSafe(student.phoneEnc, '') || null : null,
    gender: student.gender,
    age: studentAge(student),
    // Дату целиком видит только сам студент: работодателю хватает возраста
    birthDate: options.includeBirthDate ? decryptSafe(student.birthDateEnc, '') || null : null,
    photoUrl: student.photoUrl,
    resumeUrl: student.resumeUrl,
    resumeName: student.resumeName,
    university: student.university,
    speciality: student.speciality,
    studyYear: student.studyYear,
    institutionId: student.institutionId,
    studyVerified: student.studyVerified,
    city: student.city,
    workDays: student.workDays,
    hoursPerWeek: student.hoursPerWeek,
    skills: student.skills,
    about: student.about,
    lookingFor: student.lookingFor,
    goals: student.goals,
    projects: student.projects,
    achievements: student.achievements,
    activities: student.activities,
    hobbies: student.hobbies,
    links: student.links,
    videoUrl: student.videoUrl,
    status: student.status,
    createdAt: student.createdAt.toISOString(),
  };
}

/** Полных лет: по дате рождения, у анкет без неё — по году. */
export function studentAge(student: Pick<StudentRecord, 'birthDateEnc' | 'birthYear'>): number {
  const date = student.birthDateEnc ? decryptSafe(student.birthDateEnc, '') : '';
  return (date ? ageFromIso(date) : null) ?? todayInMoscow().year - student.birthYear;
}

/** Только имя — для журналов и статистики, где остальные ПДн не нужны. */
export function studentName(student: StudentRecord): string {
  return decryptSafe(student.fullNameEnc, 'Без имени');
}
