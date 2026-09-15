/**
 * Модульные проверки правил, которые одинаково работают в форме и на сервере:
 * возраст, ИНН, часы по дням, сроки справки и ожидающих откликов.
 *
 *   npm run test:unit
 *
 * Без сервера и базы. Сквозная проверка (npm run smoke) проходит те же
 * правила через API, но граничные даты — 29 февраля, полночь по Москве —
 * через API не проверить: время там всегда «сейчас».
 */
import assert from 'node:assert/strict';
import { ageFromIso, fullYears, parseIsoDate } from '../lib/age';
import { companyRegistrationSchema, innSchema } from '../lib/company';
import { isValidInn } from '../lib/inn';
import { fitHours, maxHoursPerWeek } from '../lib/schedule';
import { addWorkdays, isPendingExpired, studyStatus, workdaysLeft } from '../lib/study';
import { registrationSteps } from '../lib/validation';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL ${name} — ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log('Дата рождения');
test('несуществующая дата не разбирается', () => {
  assert.equal(parseIsoDate('2005-02-30'), null);
  assert.equal(parseIsoDate('2005-13-01'), null);
  assert.equal(parseIsoDate('2005-04'), null);
});
test('29 февраля високосного года — настоящая дата', () => {
  assert.deepEqual(parseIsoDate('2004-02-29'), { year: 2004, month: 2, day: 29 });
});
test('18 лет исполняется в день рождения, не раньше', () => {
  const birth = { year: 2008, month: 9, day: 15 };
  assert.equal(fullYears(birth, { year: 2026, month: 9, day: 14 }), 17);
  assert.equal(fullYears(birth, { year: 2026, month: 9, day: 15 }), 18);
});
test('родившийся 29 февраля становится старше 1 марта', () => {
  const birth = { year: 2008, month: 2, day: 29 };
  assert.equal(fullYears(birth, { year: 2026, month: 2, day: 28 }), 17);
  assert.equal(fullYears(birth, { year: 2026, month: 3, day: 1 }), 18);
});
test('возраст считается по календарю Москвы', () => {
  // 21:30 UTC 14 сентября — уже 00:30 15 сентября в Москве
  assert.equal(ageFromIso('2008-09-15', new Date('2026-09-14T21:30:00Z')), 18);
  assert.equal(ageFromIso('2008-09-15', new Date('2026-09-14T20:30:00Z')), 17);
});
test('шаг регистрации требует полную дату', () => {
  const base = { fullName: 'Тест Тестов', gender: 'MALE' as const };
  assert.equal(registrationSteps.identity.safeParse({ ...base, birthDate: '2005-04-12' }).success, true);
  assert.equal(registrationSteps.identity.safeParse({ ...base, birthDate: '' }).success, false);
  assert.equal(registrationSteps.identity.safeParse({ ...base, birthDate: '2015-04-12' }).success, false);
});

console.log('\nИНН');
test('ИНН организации с верной контрольной цифрой', () => {
  assert.equal(isValidInn('7707083893'), true);
  assert.equal(isValidInn('7707083894'), false);
});
test('ИНН предпринимателя: обе контрольные цифры', () => {
  assert.equal(isValidInn('500100732001'), true);
  assert.equal(isValidInn('500100732002'), false);
});
test('ИНН из формы очищается от пробелов и проверяется', () => {
  assert.equal(innSchema.parse(' 7707 083 893 '), '7707083893');
  assert.equal(innSchema.safeParse('1234567890').success, false);
  assert.equal(innSchema.safeParse('12345').success, false);
});
test('регистрация компании требует ИНН, телефон и оба согласия', () => {
  const company = {
    companyName: 'Компания',
    contactName: 'Иван Иванов',
    email: 'hr@example.org',
    password: 'Smoke12345!',
    industry: null,
    city: 'Казань',
    inn: '7707083893',
    phone: '+7 900 111-22-33',
    consent: true,
    terms: true,
  };
  assert.equal(companyRegistrationSchema.safeParse(company).success, true);
  assert.equal(companyRegistrationSchema.safeParse({ ...company, phone: '' }).success, false);
  assert.equal(companyRegistrationSchema.safeParse({ ...company, terms: false }).success, false);
  assert.equal(companyRegistrationSchema.safeParse({ ...company, inn: '7707083894' }).success, false);
});

console.log('\nЧасы по дням');
test('потолок — восемь часов в день и сорок в неделю', () => {
  assert.equal(maxHoursPerWeek(1), 8);
  assert.equal(maxHoursPerWeek(3), 24);
  assert.equal(maxHoursPerWeek(7), 40);
});
test('часы подгоняются под дни наибольшим вариантом', () => {
  assert.equal(fitHours(20, 1), 8);
  assert.equal(fitHours(40, 3), 24);
  assert.equal(fitHours(12, 3), 12);
  assert.equal(fitHours(null, 1), null);
});
test('шаг графика отвергает часы, которые не помещаются в дни', () => {
  assert.equal(registrationSteps.schedule.safeParse({ workDays: ['MON'], hoursPerWeek: 20 }).success, false);
  assert.equal(registrationSteps.schedule.safeParse({ workDays: ['MON'], hoursPerWeek: 8 }).success, true);
});

console.log('\nСправка и ожидающие отклики');
test('четыре рабочих дня пропускают выходные', () => {
  // Пятница 11 сентября 2026 → четверг 17 сентября
  const deadline = addWorkdays(new Date(2026, 8, 11, 10), 4);
  assert.equal(deadline.getDate(), 17);
  assert.equal(workdaysLeft(deadline, new Date(2026, 8, 11, 11)), 4);
  assert.equal(workdaysLeft(deadline, new Date(2026, 8, 17, 9)), 0);
});
test('ожидающий отклик истекает ровно через 14 дней', () => {
  const swiped = new Date('2026-09-01T10:00:00Z');
  assert.equal(isPendingExpired(swiped, new Date('2026-09-15T09:59:00Z')), false);
  assert.equal(isPendingExpired(swiped, new Date('2026-09-15T10:00:00Z')), true);
});
test('статус учёбы складывается из отметки, файла и причины', () => {
  assert.equal(studyStatus({ studyVerified: true, studyDocUrl: null, studyReviewNote: null }), 'VERIFIED');
  assert.equal(studyStatus({ studyVerified: false, studyDocUrl: '/api/files/study/x.pdf', studyReviewNote: 'старая' }), 'PENDING');
  assert.equal(studyStatus({ studyVerified: false, studyDocUrl: null, studyReviewNote: 'нечитаемо' }), 'REJECTED');
  assert.equal(studyStatus({ studyVerified: false, studyDocUrl: null, studyReviewNote: null }), 'NONE');
});

console.log(`\n${passed} проверок пройдено, ${failures.length} провалено`);
if (failures.length) process.exitCode = 1;
