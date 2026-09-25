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
import crypto from 'node:crypto';
import { verifyStaffTicket } from '../lib/security/staff-ticket';
import { staffCan, staffHome } from '../lib/staff-permissions';
import { ageFromIso, fullYears, parseIsoDate } from '../lib/age';
import { companyRegistrationSchema, hasCompanyProfile, innSchema } from '../lib/company';
import { isValidInn } from '../lib/inn';
import { rankInstitutions } from '../lib/rating';
import { fitHours, maxHoursPerWeek } from '../lib/schedule';
import { addWorkdays, applicationsOpen, isPendingExpired, studyStatus, workdaysLeft } from '../lib/study';
import { isCodeShape, maskEmail, normalizeCode, resendWaitSeconds } from '../lib/account-codes';
import { applicationStatusMail, emailCodeMail, escapeHtml, messagesDigestMail, passwordResetMail } from '../lib/mail/templates';
import { emailCodeSchema, registrationSteps } from '../lib/validation';

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
test('регистрация компании требует телефон и оба согласия — название, ИНН и контакт дозаполняются потом', () => {
  const company = {
    companyName: 'Компания',
    contactName: 'Иван Иванов',
    email: 'hr@example.org',
    password: 'Smoke12345!',
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
  // Упрощённая регистрация: название, контакт и ИНН можно не присылать вовсе
  const minimal = {
    email: 'hr2@example.org',
    password: 'Smoke12345!',
    city: null,
    phone: '+7 900 111-22-33',
    consent: true,
    terms: true,
  };
  assert.equal(companyRegistrationSchema.safeParse(minimal).success, true);
});
test('клиенту CRM для отправки вакансии ИНН не нужен — он сверен по договору', () => {
  const base = { companyName: 'Кофейни «Север»', contactName: 'Иван Иванов' };
  assert.equal(hasCompanyProfile({ ...base, inn: null, crmClientId: 'client-sever' }), true);
  assert.equal(hasCompanyProfile({ ...base, inn: null, crmClientId: null }), false);
  assert.equal(hasCompanyProfile({ ...base, inn: '7707083893', crmClientId: null }), true);
  assert.equal(hasCompanyProfile({ companyName: '', contactName: '', inn: null, crmClientId: 'client-sever' }), false);
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

console.log('\nРейтинг вузов');
const school = (slug: string, students: number, hired: number) => ({
  slug,
  label: slug.toUpperCase(),
  name: slug,
  students,
  applications: students * 2,
  invited: hired,
  hired,
});
test('меньше пяти студентов — цифры не публикуются', () => {
  const [row] = rankInstitutions([school('a', 4, 1)]);
  assert.equal(row.students, null);
  assert.equal(row.share, null);
  assert.equal(row.place, null);
});
test('от пяти до девяти — цифры есть, места нет', () => {
  const [row] = rankInstitutions([school('a', 7, 2)]);
  assert.equal(row.students, 7);
  assert.equal(row.share, 29);
  assert.equal(row.place, null);
});
test('место — по доле, при равной доле выше тот, где работающих больше; ничья делит место', () => {
  const rows = rankInstitutions([school('x', 20, 10), school('y', 10, 5), school('z', 10, 6), school('w', 10, 5)]);
  const place = (slug: string) => rows.find((r) => r.slug === slug)?.place;
  assert.equal(place('z'), 1);
  assert.equal(place('x'), 2);
  assert.equal(place('y'), 3);
  assert.equal(place('w'), 3);
});

console.log('\nПочта');
test('код из поля ввода: пробелы и дефисы отбрасываются', () => {
  assert.equal(normalizeCode(' 12-34 56 '), '123456');
  assert.equal(isCodeShape('123456'), true);
  assert.equal(isCodeShape('12345'), false);
  assert.equal(emailCodeSchema.parse({ code: '12 34 56' }).code, '123456');
  assert.equal(emailCodeSchema.safeParse({ code: '12ab' }).success, false);
});
test('повторный код — не раньше чем через минуту', () => {
  const sent = new Date('2026-09-15T10:00:00Z');
  assert.equal(resendWaitSeconds(null), 0);
  assert.equal(resendWaitSeconds(sent, new Date('2026-09-15T10:00:20Z')), 40);
  assert.equal(resendWaitSeconds(sent, new Date('2026-09-15T10:01:00Z')), 0);
});
test('адрес в подсказке скрыт, домен виден', () => {
  assert.equal(maskEmail('alice@mail.ru'), 'a***@mail.ru');
  assert.equal(maskEmail('не адрес'), '***');
});
test('отклики уходят, только когда подтверждены и учёба, и почта, и дозаполнен вуз', () => {
  const at = new Date();
  const filled = { university: 'КФУ', speciality: 'Экономика', studyYear: 2 };
  const unfilled = { university: '', speciality: '', studyYear: 0 };
  assert.equal(applicationsOpen({ studyVerified: true, ...filled }, { emailVerifiedAt: at }), true);
  assert.equal(applicationsOpen({ studyVerified: true, ...filled }, { emailVerifiedAt: null }), false);
  assert.equal(applicationsOpen({ studyVerified: false, ...filled }, { emailVerifiedAt: at }), false);
  assert.equal(applicationsOpen({ studyVerified: true, ...filled }, null), false);
  // Упрощённая регистрация могла не спросить вуз — до дозаполнения в
  // профиле отклики ждут, как и без подтверждения учёбы или почты
  assert.equal(applicationsOpen({ studyVerified: true, ...unfilled }, { emailVerifiedAt: at }), false);
});
test('письмо с кодом: код в теме, тексте и HTML', () => {
  const mail = emailCodeMail({ code: '042917', minutes: 30 });
  assert.ok(mail.subject.includes('042917'));
  assert.ok(mail.text.includes('Код: 042917'));
  assert.ok(mail.html.includes('042917'));
});
test('HTML письма экранирует текст', () => {
  assert.equal(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  const mail = messagesDigestMail({ count: 2, title: '<script>alert(1)</script>', url: 'https://example.org/messages' });
  assert.ok(!mail.html.includes('<script>'));
});
test('ссылка сброса есть и в тексте, и в кнопке', () => {
  const mail = passwordResetMail({ url: 'https://students.example.org/reset/abc', minutes: 60 });
  assert.ok(mail.text.includes('https://students.example.org/reset/abc'));
  assert.ok(mail.html.includes('href="https://students.example.org/reset/abc"'));
});
test('на новый отклик письма студенту нет, на приглашение — есть', () => {
  assert.equal(applicationStatusMail({ status: 'NEW', company: 'А', title: 'Б', url: 'https://x.org' }), null);
  assert.ok(applicationStatusMail({ status: 'INVITED', company: 'А', title: 'Б', url: 'https://x.org' })?.subject.includes('приглашают'));
});

console.log('\nВход из CRM');
const ssoSecret = 'k'.repeat(40);
function signTicket(claims: Record<string, unknown>, secret = ssoSecret): string {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({
      v: 1, iss: 'fattakhov-crm', aud: 'fattakhov-students', kind: 'staff', sub: 'usr_1', email: 'Staff@Agency.ru',
      name: 'Анна', position: 'Администратор', permissions: ['students'], iat: now, exp: now + 60,
      jti: 'j'.repeat(22), ...claims,
    }),
  ).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}
function signClientTicket(claims: Record<string, unknown>, secret = ssoSecret): string {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({
      v: 1, iss: 'fattakhov-crm', aud: 'fattakhov-students', kind: 'client', sub: 'usr_client_1',
      crmClientId: 'client_a', companyName: 'Кофейни «Север»', contactName: 'Анна',
      contactEmail: 'Anna@Sever.ru', iat: now, exp: now + 60, jti: 'j'.repeat(22), ...claims,
    }),
  ).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}
test('верный билет из CRM принимается, почта — в нижнем регистре', () => {
  const result = verifyStaffTicket(signTicket({}), ssoSecret);
  assert.equal(result.ok, true);
  if (result.ok && result.ticket.kind === 'staff') {
    assert.equal(result.ticket.email, 'staff@agency.ru');
    assert.deepEqual(result.ticket.permissions, ['students']);
  }
});
test('билет клиента CRM принимается, почта — в нижнем регистре', () => {
  const result = verifyStaffTicket(signClientTicket({}), ssoSecret);
  assert.equal(result.ok, true);
  if (result.ok && result.ticket.kind === 'client') {
    assert.equal(result.ticket.crmClientId, 'client_a');
    assert.equal(result.ticket.companyName, 'Кофейни «Север»');
    assert.equal(result.ticket.contactEmail, 'anna@sever.ru');
  }
});
test('билет клиента без crmClientId или компании не проходит', () => {
  assert.equal(verifyStaffTicket(signClientTicket({ crmClientId: '' }), ssoSecret).ok, false);
  assert.equal(verifyStaffTicket(signClientTicket({ companyName: '' }), ssoSecret).ok, false);
  assert.equal(verifyStaffTicket(signClientTicket({ contactEmail: 'не почта' }), ssoSecret).ok, false);
});
test('чужая подпись, истёкший срок, чужой адресат и мусор не проходят', () => {
  assert.deepEqual(verifyStaffTicket(signTicket({}, 'x'.repeat(40)), ssoSecret), { ok: false, reason: 'SIGNATURE' });
  const past = Math.floor(Date.now() / 1000) - 120;
  assert.deepEqual(verifyStaffTicket(signTicket({ iat: past, exp: past + 60 }), ssoSecret), { ok: false, reason: 'EXPIRED' });
  assert.deepEqual(verifyStaffTicket(signTicket({ aud: 'другое' }), ssoSecret), { ok: false, reason: 'CLAIMS' });
  assert.deepEqual(verifyStaffTicket('мусор', ssoSecret), { ok: false, reason: 'FORMAT' });
});
test('билет без известных разделов или с долгим сроком не принимается', () => {
  assert.equal(verifyStaffTicket(signTicket({ permissions: ['admin'] }), ssoSecret).ok, false);
  const now = Math.floor(Date.now() / 1000);
  assert.equal(verifyStaffTicket(signTicket({ iat: now, exp: now + 3600 }), ssoSecret).ok, false);
});
test('разделы сотрудника: без списка — всё, со списком — только выданное', () => {
  assert.equal(staffCan({ role: 'ADMIN' }, 'moderation'), true);
  assert.equal(staffCan({ role: 'ADMIN', permissions: ['students'] }, 'moderation'), false);
  assert.equal(staffCan({ role: 'STUDENT' }, 'students'), false);
  assert.equal(staffHome(['pilot', 'students']), '/admin/students');
});

console.log(`\n${passed} проверок пройдено, ${failures.length} провалено`);
if (failures.length) process.exitCode = 1;
