/**
 * Сквозная проверка по API против запущенного сервера.
 *
 *   npm run dev
 *   npm run smoke
 *
 * Проходит весь путь продукта: регистрация студента → лента → свайп
 * вправо (он же отклик) → свайп влево → возврат из пропущенных →
 * кабинет работодателя со сменой статуса → панель админа с
 * синхронизацией. Ошибка на любом шаге валит процесс с ненулевым кодом.
 *
 * Проверяются и границы доступа: гость не должен видеть ленту,
 * работодатель — не должен попадать в админку.
 */

import crypto from 'node:crypto';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:3007';

/**
 * Дата «ГГГГ-ММ-ДД» столько-то лет назад со сдвигом в днях. Запас в пару
 * дней снимает расхождение пояса машины и Москвы на границе суток.
 */
function isoYearsAgo(years: number, days = 0): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Случайный ИНН организации с верной контрольной цифрой — свой на каждый прогон. */
function randomInn(): string {
  const digits = Array.from({ length: 9 }, (_, i) => (i === 0 ? 1 + Math.floor(Math.random() * 9) : Math.floor(Math.random() * 10)));
  const weights = [2, 4, 10, 3, 5, 9, 4, 6, 8];
  const check = (weights.reduce((sum, w, i) => sum + w * digits[i], 0) % 11) % 10;
  return [...digits, check].join('');
}

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

/** Отдельная «банка» кук на роль: сессии не должны мешать друг другу. */
class Session {
  private cookie = '';

  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    // Origin обязателен: роуты отвергают изменяющие запросы с чужого источника
    headers.set('Origin', BASE);
    if (this.cookie) headers.set('Cookie', this.cookie);
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${BASE}${path}`, { ...init, headers, redirect: 'manual' });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];

    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* не JSON — оставляем текстом */
    }
    return { status: response.status, body: body as any };
  }

  post(path: string, payload: unknown) {
    return this.request(path, { method: 'POST', body: JSON.stringify(payload) });
  }
  patch(path: string, payload: unknown) {
    return this.request(path, { method: 'PATCH', body: JSON.stringify(payload) });
  }
  delete(path: string, payload: unknown) {
    return this.request(path, { method: 'DELETE', body: JSON.stringify(payload) });
  }
}

/** Письма без почтового сервера — из журнала процесса (только в разработке). */
async function mailbox(address: string): Promise<Array<{ subject: string; text: string }>> {
  const response = await fetch(`${BASE}/api/dev/outbox?email=${encodeURIComponent(address)}`);
  if (!response.ok) return [];
  return ((await response.json()) as { messages: Array<{ subject: string; text: string }> }).messages;
}

async function lastMail(address: string, subjectPart: string) {
  return (await mailbox(address)).filter((m) => m.subject.includes(subjectPart)).at(-1) ?? null;
}

function codeFrom(mail: { text: string } | null): string | null {
  return mail?.text.match(/Код: (\d{6})/)?.[1] ?? null;
}

async function main() {
  console.log(`Сквозная проверка ${BASE}\n`);

  // ---------- Гость ----------
  console.log('Гость');
  const guest = new Session();
  check('лента закрыта для гостя', (await guest.request('/api/feed')).status === 401);
  check('статистика закрыта для гостя', (await guest.request('/api/admin/stats')).status === 401);
  check('витрина открыта', (await guest.request('/')).status === 200);

  // ---------- Студент ----------
  console.log('\nСтудент');
  const student = new Session();
  const email = `smoke-${Date.now()}@demo.ru`;

  const studentPayload = {
    fullName: 'Тест Тестов',
    gender: 'MALE',
    birthDate: '2005-04-12',
    photoUrl: null,
    university: 'КФУ',
    speciality: 'Экономика',
    studyYear: 3,
    city: 'Казань',
    workDays: ['MON', 'WED', 'FRI'],
    hoursPerWeek: 20,
    skills: ['Excel', 'SMM'],
    about: null,
    resumeUrl: null,
    resumeName: null,
    email,
    password: 'Smoke12345!',
    phone: '+7 900 111-22-33',
    consent: true,
    terms: true,
  };
  const registerStarted = await student.post('/api/auth/register', studentPayload);
  check('регистрация принята, код отправлен', registerStarted.status === 201 && !!registerStarted.body?.pending, registerStarted.body);
  let pendingToken = registerStarted.body?.pending as string;

  // HR нужен уже здесь: учёбу нового студента подтверждает он, и до этого
  // отклики студента ждут и работодателям не уходят
  const hr = new Session();
  const hrLogin = await hr.post('/api/auth/login', { email: 'admin@fattakhov.ru', password: 'Admin12345!' });
  check('HR-менеджер входит', hrLogin.status === 200, hrLogin.body);

  // Почта: код нужен до создания учётной записи — аккаунта ещё нет
  check('журнал писем разработки доступен', (await fetch(`${BASE}/api/dev/outbox`)).status === 400);
  const emailCode = codeFrom(await lastMail(email, 'Код подтверждения'));
  check('письмо с кодом пришло при регистрации', !!emailCode, emailCode);

  const resendTooSoon = await student.post('/api/auth/register/resend', { pending: pendingToken });
  check(
    'повторный код не раньше чем через минуту',
    resendTooSoon.status === 429 && typeof resendTooSoon.body?.retryAfter === 'number',
    resendTooSoon.body,
  );

  const badToken = await student.post('/api/auth/register/confirm', { pending: 'garbage', code: emailCode ?? '000000' });
  check('испорченный билет регистрации отклонён', badToken.status === 410, badToken.body);

  const badVerify = await student.post('/api/auth/register/confirm', {
    pending: pendingToken,
    code: emailCode === '000000' ? '111111' : '000000',
  });
  check(
    'неверный код отклонён с числом попыток',
    badVerify.status === 400 && String(badVerify.body?.error).includes('Осталось попыток'),
    badVerify.body,
  );
  if (badVerify.body?.pending) pendingToken = badVerify.body.pending;

  const malformedCode = await student.post('/api/auth/register/confirm', { pending: pendingToken, code: '12ab' });
  check('код не из шести цифр отклонён', malformedCode.status === 400 && !!malformedCode.body?.fields?.code, malformedCode.body);

  const registered = await student.post('/api/auth/register/confirm', { pending: pendingToken, code: emailCode });
  check('регистрация подтверждается кодом', registered.status === 201, registered.body);

  const meAfter = await student.request('/api/auth/me');
  const studentId = meAfter.body.session?.profileId as string;
  check('почта подтверждена сразу вместе с кодом регистрации', meAfter.body?.account?.emailVerified === true, meAfter.body?.account);

  const weakPassword = await new Session().post('/api/auth/register', {
    fullName: 'Тест Тестов',
    gender: 'MALE',
    birthDate: '2005-04-12',
    photoUrl: null,
    university: 'КФУ',
    speciality: 'Экономика',
    studyYear: 3,
    city: null,
    workDays: ['MON', 'WED', 'FRI'],
    hoursPerWeek: 20,
    skills: [],
    about: null,
    resumeUrl: null,
    resumeName: null,
    email: `weak-${Date.now()}@demo.ru`,
    password: 'короткий',
    phone: '',
    consent: true,
    terms: true,
  });
  check('слабый пароль отвергнут', weakPassword.status === 400, weakPassword.body);

  const noConsent = await new Session().post('/api/auth/register', {
    fullName: 'Тест Тестов',
    gender: 'MALE',
    birthDate: '2005-04-12',
    photoUrl: null,
    university: 'КФУ',
    speciality: 'Экономика',
    studyYear: 3,
    city: null,
    workDays: ['MON', 'WED', 'FRI'],
    hoursPerWeek: 20,
    skills: [],
    about: null,
    resumeUrl: null,
    resumeName: null,
    email: `noconsent-${Date.now()}@demo.ru`,
    password: 'Smoke12345!',
    phone: '',
    consent: false,
    terms: false,
  });
  check('регистрация без согласия на ПДн отвергнута', noConsent.status === 400 && !!noConsent.body?.fields?.consent, noConsent.body);
  check('регистрация без пользовательского соглашения отвергнута', noConsent.status === 400 && !!noConsent.body?.fields?.terms, noConsent.body);

  // Подтверждение кода само выдаёт сессию, поэтому «подтвердил код» ещё не
  // значит «сможет войти снова». Ровно этот путь — выйти и войти заново —
  // не проверялся вовсе, и сломайся хеширование пароля на одной из сторон,
  // все проверки выше остались бы зелёными.
  const relogin = await new Session().post('/api/auth/login', { email, password: 'Smoke12345!' });
  check('после регистрации можно войти заново', relogin.status === 200, relogin.body);
  const reloginWrong = await new Session().post('/api/auth/login', { email, password: 'Smoke12345?' });
  check('чужой пароль к той же почте не подходит', reloginWrong.status === 401, reloginWrong.status);

  // Занятая почта — это 409 с понятной причиной, а не 500: иначе студент
  // видит «что-то сломалось» и пробует снова, вместо того чтобы войти
  const duplicate = await new Session().post('/api/auth/register', {
    fullName: 'Тест Дубликатов',
    gender: 'MALE',
    birthDate: '2005-04-12',
    photoUrl: null,
    university: 'КФУ',
    speciality: 'Экономика',
    studyYear: 3,
    city: 'Казань',
    workDays: ['MON', 'WED', 'FRI'],
    hoursPerWeek: 20,
    skills: [],
    about: null,
    resumeUrl: null,
    resumeName: null,
    email,
    password: 'Smoke12345!',
    phone: '',
    consent: true,
    terms: true,
  });
  check('почту студента нельзя занять повторно', duplicate.status === 409, duplicate.status);

  const feed = await student.request('/api/feed');
  const vacancies = feed.body.vacancies as Array<{ id: string; matchScore: number }>;
  check('лента непустая', Array.isArray(vacancies) && vacancies.length > 0);
  check('совпадение посчитано', typeof vacancies?.[0]?.matchScore === 'number', vacancies?.[0]);
  check(
    'лента отсортирована по совпадению',
    vacancies.every((v, i) => i === 0 || vacancies[i - 1].matchScore >= v.matchScore - 30),
  );

  const liked = vacancies[0];
  const skippedVacancy = vacancies[1];

  const swipeRight = await student.post('/api/swipes', { vacancyId: liked.id, direction: 'RIGHT' });
  check(
    'без подтверждения учёбы отклик ждёт',
    swipeRight.status === 200 && swipeRight.body.pending === true && swipeRight.body.applied === false,
    swipeRight.body,
  );
  const waitingList = await student.request('/api/applications');
  check(
    'ожидающий отклик виден студенту со сроком',
    waitingList.body.pending?.some((p: any) => p.vacancy.id === liked.id && typeof p.expiresAt === 'string'),
    waitingList.body,
  );
  check('ожидающий отклик ещё не отклик', !waitingList.body.applications?.some((a: any) => a.vacancy.id === liked.id));

  // Справка: студент загружает, HR возвращает с причиной, студент загружает
  // снова, HR подтверждает — и ожидавший отклик уходит работодателю
  const pdf = new Blob([Buffer.from('%PDF-1.4\n%smoke\n', 'utf8')], { type: 'application/pdf' });
  const studyForm = () => {
    const fd = new FormData();
    fd.append('kind', 'study');
    fd.append('file', pdf, 'spravka.pdf');
    return fd;
  };
  const uploadStudy = async (who: Session) => {
    const res = await fetch(`${BASE}/api/upload`, {
      method: 'POST',
      headers: { Origin: BASE, Cookie: (who as any).cookie },
      body: studyForm(),
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as { url?: string; name?: string } };
  };
  const guestStudy = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { Origin: BASE }, body: studyForm() });
  check('гость не загружает справку', guestStudy.status === 401, guestStudy.status);
  const firstDoc = await uploadStudy(student);
  check('студент загружает справку', firstDoc.status === 201 && !!firstDoc.body.url, firstDoc);
  const attached = await student.request('/api/students/me/study', {
    method: 'PUT',
    body: JSON.stringify({ url: firstDoc.body.url, name: 'spravka.pdf' }),
  });
  check('справка уходит на проверку', attached.status === 200 && attached.body?.study?.status === 'PENDING', attached.body);
  const foreignDoc = await student.request('/api/students/me/study', {
    method: 'PUT',
    body: JSON.stringify({ url: '/api/files/photo/00000000-0000-0000-0000-000000000000.jpg', name: 'x' }),
  });
  check('справкой нельзя сделать чужой файл', foreignDoc.status === 400, foreignDoc.status);
  const findStudent = async () =>
    (((await hr.request('/api/admin/students')).body?.students ?? []) as Array<Record<string, any>>).find(
      (s) => s.id === studentId,
    );
  const queuedStudent = await findStudent();
  check(
    'HR видит справку на проверке',
    queuedStudent?.study === 'PENDING' && queuedStudent?.studyDocUrl === firstDoc.body.url,
    queuedStudent,
  );
  if (firstDoc.body.url) check('HR открывает справку', (await hr.request(firstDoc.body.url)).status === 200);
  check(
    'HR не возвращает справку без причины',
    (await hr.patch('/api/admin/students', { studentId, studyDecision: 'REJECT' })).status === 400,
  );
  const rejectedDoc = await hr.patch('/api/admin/students', {
    studentId,
    studyDecision: 'REJECT',
    note: 'Нечитаемый скан, загрузите фото чётче',
  });
  check('HR возвращает справку с причиной', rejectedDoc.status === 200, rejectedDoc.body);
  const afterReject = await student.request('/api/students/me/study');
  check(
    'причину отказа видит студент',
    afterReject.body?.study?.status === 'REJECTED' && afterReject.body?.study?.note === 'Нечитаемый скан, загрузите фото чётче',
    afterReject.body,
  );
  if (firstDoc.body.url) check('возвращённая справка удалена с сервера', (await hr.request(firstDoc.body.url)).status === 404);
  const secondDoc = await uploadStudy(student);
  await student.request('/api/students/me/study', {
    method: 'PUT',
    body: JSON.stringify({ url: secondDoc.body.url, name: 'spravka-2.pdf' }),
  });
  const approvedDoc = await hr.patch('/api/admin/students', { studentId, studyDecision: 'APPROVE' });
  check('HR подтверждает учёбу по справке', approvedDoc.status === 200 && approvedDoc.body?.studyVerified === true, approvedDoc.body);
  // Почта подтверждена ещё при регистрации (кодом) — единственное, чего
  // ждал отклик, это подтверждение учёбы, и оно только что случилось
  check('отклик уходит работодателю сразу после подтверждения учёбы — почта уже подтверждена при регистрации', approvedDoc.body?.released === 1, approvedDoc.body);
  const rejectMail = await lastMail(email, 'Справку об обучении');
  check('письмо о возвращённой справке пришло с причиной', !!rejectMail?.text.includes('Нечитаемый скан'), rejectMail?.subject);
  check('письмо «учёба подтверждена» пришло', !!(await lastMail(email, 'Учёба подтверждена')));
  // Эндпойнт /api/auth/email/verify остаётся для старых, ещё не подтверждённых
  // учётных записей — на уже подтверждённой он должен молча отвечать успехом,
  // а не ломаться и не выпускать отклик повторно
  const verifiedAgain = await student.post('/api/auth/email/verify', { code: emailCode ?? '000000' });
  check('повторный ввод кода на уже подтверждённой почте не ломается', verifiedAgain.status === 200 && verifiedAgain.body?.verified === true, verifiedAgain.body);
  if (secondDoc.body.url) check('проверенная справка удалена с сервера', (await hr.request(secondDoc.body.url)).status === 404);

  const applications = await student.request('/api/applications');
  check(
    'отклик виден студенту',
    applications.body.applications?.some((a: any) => a.vacancy.id === liked.id),
  );
  check('ожидающих откликов не осталось', (applications.body.pending ?? []).length === 0, applications.body.pending);

  await student.post('/api/swipes', { vacancyId: skippedVacancy.id, direction: 'LEFT' });
  const skipped = await student.request('/api/skipped');
  check(
    'пропущенная вакансия в разделе',
    skipped.body.skipped?.some((s: any) => s.vacancy.id === skippedVacancy.id),
  );

  const feedAfter = await student.request('/api/feed');
  check(
    'разобранные вакансии ушли из ленты',
    !feedAfter.body.vacancies.some((v: any) => v.id === liked.id || v.id === skippedVacancy.id),
  );

  await student.delete('/api/swipes', { vacancyId: skippedVacancy.id });
  const feedRestored = await student.request('/api/feed');
  check(
    'возврат из пропущенных возвращает в ленту',
    feedRestored.body.vacancies.some((v: any) => v.id === skippedVacancy.id),
  );

  check('студента не пускают в админку', (await student.request('/api/admin/stats')).status === 401);

  // Инструкция: сама открывается один раз, отметка — в учётной записи
  check('гостю отметка инструкции закрыта', (await new Session().request('/api/tour')).status === 401);
  const tourBefore = await student.request('/api/tour');
  check('новый студент инструкцию не видел', tourBefore.status === 200 && tourBefore.body?.seen === false && tourBefore.body?.role === 'STUDENT', tourBefore.body);
  const tourDone = await student.post('/api/tour', {});
  const tourAfter = await student.request('/api/tour');
  check('пройденная инструкция отмечается', tourDone.status === 200 && tourAfter.body?.seen === true, tourAfter.body);
  const help = await new Session().request('/help');
  check('страница помощи открыта гостю', help.status === 200 && String(help.body).includes('Как подтвердить учёбу?'), help.status);

  // ---------- Работодатель ----------
  console.log('\nРаботодатель');
  const employer = new Session();
  const badCode = await employer.post('/api/auth/employer', { code: 'WRON-GCOD-EWRO-NGCO' });
  check('неверный код отвергнут', badCode.status === 401, badCode.body);

  const employerLogin = await employer.post('/api/auth/employer', { code: 'SEVR-2026-DEMO' });
  check('вход по коду из CRM', employerLogin.status === 200, employerLogin.body);

  const board = await employer.request('/api/employer/applications');
  check('кабинет отдаёт отклики', Array.isArray(board.body.applications), board.body);
  const application = board.body.applications?.[0];
  check(
    'контакты студента расшифрованы',
    !!application && typeof application.student.fullName === 'string' && application.student.fullName.length > 2,
    application?.student?.fullName,
  );
  check(
    'портфолио передаётся работодателю',
    !!application && Array.isArray(application.student.projects) && Array.isArray(application.student.lookingFor),
    application && Object.keys(application.student),
  );

  if (application) {
    const statusChange = await employer.patch('/api/employer/applications', {
      applicationId: application.id,
      status: 'INTERVIEW',
    });
    check('смена статуса отклика', statusChange.status === 200, statusChange.body);
  }

  const foreign = await employer.patch('/api/employer/applications', {
    applicationId: 'no-such-application',
    status: 'HIRED',
  });
  check('чужой отклик недоступен', foreign.status === 404 || foreign.status === 403, foreign.body);
  check('работодателя не пускают в админку', (await employer.request('/api/admin/stats')).status === 401);

  // ---------- Администратор ----------
  console.log('\nАдминистратор');
  const admin = new Session();
  const wrongPassword = await admin.post('/api/auth/login', {
    email: 'admin@fattakhov.ru',
    password: 'wrong-password',
  });
  check('неверный пароль отвергнут', wrongPassword.status === 401);

  const adminLogin = await admin.post('/api/auth/login', {
    email: 'admin@fattakhov.ru',
    password: 'Admin12345!',
  });
  check('вход администратора', adminLogin.status === 200, adminLogin.body);

  const stats = await admin.request('/api/admin/stats');
  check('статистика собрана', stats.status === 200 && stats.body.stats?.students?.total > 0, stats.body?.stats?.students);
  check('журнал аудита пишется', (stats.body.audit?.length ?? 0) > 0);
  check(
    'раздел «кто в процессе» заполнен',
    Array.isArray(stats.body.stats?.inProgress) && stats.body.stats.inProgress.length > 0,
  );

  const sync = await admin.post('/api/admin/sync', {});
  check('синхронизация с CRM', sync.status === 200 && sync.body.run?.status === 'SUCCESS', sync.body);
  check('синхронизация обновила вакансии', (sync.body.run?.updated ?? 0) > 0, sync.body.run);

  // ---------- Переписка ----------
  console.log('\nПереписка');

  // Свежий отклик: работодатель ещё не отреагировал, писать нельзя
  const freshThreads = await student.request('/api/messages');
  const freshThread = freshThreads.body.threads?.[0];
  check('диалог заведён на отклик', !!freshThread, freshThreads.body);
  check(
    'по новому отклику студенту писать нельзя',
    freshThread?.canWrite === false && typeof freshThread?.lockedReason === 'string',
    freshThread,
  );

  if (freshThread) {
    const blocked = await student.post(`/api/messages/${freshThread.applicationId}`, {
      body: 'Здравствуйте, очень хочу у вас работать!',
    });
    check('блокировка держится на сервере, а не только в вёрстке', blocked.status === 403, blocked.body);
  }

  // Работодатель открывает диалог первым
  const employerThreads = await employer.request('/api/messages');
  const employerThread = employerThreads.body.threads?.[0];
  check('работодатель видит свои диалоги', !!employerThread, employerThreads.body);
  check('работодателю писать можно всегда', employerThread?.canWrite === true, employerThread);

  if (employerThread) {
    const sent = await employer.post(`/api/messages/${employerThread.applicationId}`, {
      body: 'Здравствуйте! Готовы пригласить вас на пробную смену.',
    });
    check('работодатель отправил сообщение', sent.status === 201, sent.body);
    check('сообщение помечено как своё', sent.body.message?.mine === true, sent.body.message);

    const back = await employer.request(`/api/messages/${employerThread.applicationId}`);
    const lastBody = back.body.thread?.messages?.at(-1)?.body;
    check(
      'текст расшифровывается обратно',
      lastBody === 'Здравствуйте! Готовы пригласить вас на пробную смену.',
      lastBody,
    );

    const empty = await employer.post(`/api/messages/${employerThread.applicationId}`, { body: '   ' });
    check('пустое сообщение отвергнуто', empty.status === 400, empty.body);

    const foreign = await student.request(`/api/messages/${employerThread.applicationId}`);
    check('чужая переписка недоступна', foreign.status === 404, foreign.status);
  }

  // Демо-студент: у него отклик уже в работе, писать можно
  const demo = new Session();
  await demo.post('/api/auth/login', {
    email: 'student@demo.ru',
    password: 'Demo12345!',
  });
  const demoThreads = await demo.request('/api/messages');
  const live = demoThreads.body.threads?.find((t: any) => t.canWrite === true);
  check('по отклику в работе студент писать может', !!live, demoThreads.body.threads?.[0]);

  if (live) {
    check('непрочитанное посчитано', typeof live.unread === 'number', live);

    const reply = await demo.post(`/api/messages/${live.applicationId}`, {
      body: 'Спасибо, четверг в 18:00 подходит.',
    });
    check('студент ответил', reply.status === 201, reply.body);

    const read = await demo.patch(`/api/messages/${live.applicationId}`, {});
    check('отметка о прочтении принята', read.status === 200, read.body);

    const after = await demo.request(`/api/messages/${live.applicationId}`);
    check('после отметки непрочитанного нет', after.body.thread?.unread === 0, after.body.thread?.unread);
  }

  // Живой поток
  const streamed = await (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(`${BASE}/api/messages/stream`, {
        headers: { Cookie: (demo as any).cookie, Origin: BASE },
        signal: controller.signal,
      });
      const type = response.headers.get('content-type') ?? '';
      const reader = response.body?.getReader();
      const first = reader ? await reader.read() : null;
      void reader?.cancel();
      return {
        status: response.status,
        type,
        payload: first?.value ? new TextDecoder().decode(first.value) : '',
      };
    } catch {
      return { status: 0, type: '', payload: '' };
    } finally {
      clearTimeout(timer);
    }
  })();
  check('поток событий отвечает', streamed.status === 200, streamed.status);
  check('поток отдаётся как SSE', streamed.type.includes('text/event-stream'), streamed.type);
  check('поток сразу шлёт готовность', streamed.payload.includes('"ready"'), streamed.payload.slice(0, 60));

  const guestStream = await fetch(`${BASE}/api/messages/stream`).then((r) => r.status);
  check('гостя в поток не пускают', guestStream === 401, guestStream);
  check('гость не видит диалогов', (await guest.request('/api/messages')).status === 401);

  // ---------- Устаревшая сессия ----------
  // Подпись у токена ещё верна, а аккаунта, на который он указывает, уже
  // нет — так бывает после пересоздания базы. Раньше это давало 500 в
  // серверном компоненте; теперь сессия обязана сниматься.
  console.log('\nУстаревшая сессия');
  const staleExit = await fetch(`${BASE}/logout?reason=stale&next=/feed`, { redirect: 'manual' });
  const location = staleExit.headers.get('location') ?? '';
  const setCookie = staleExit.headers.get('set-cookie') ?? '';
  check('аварийный выход отвечает редиректом', staleExit.status >= 300 && staleExit.status < 400, staleExit.status);
  check('уводит на вход с причиной', location.includes('/login') && location.includes('stale'), location);
  check(
    'куку сессии снимает',
    /fhr_session=;|fhr_session=""|Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(setCookie),
    setCookie.slice(0, 80),
  );

  // ---------- Быстрая серия решений ----------
  // Регрессия. Решения приходят быстрее, чем отвечает сервер: человек
  // смахивает следующую карточку, пока летит запрос по предыдущей.
  // Колода отбрасывала всё, что пришло в это окно, — отклик пропадал
  // молча, а смахнутая карточка застывала посреди экрана.
  console.log('\nБыстрая серия решений');
  const burstFeed = await student.request('/api/feed');
  const burst = (burstFeed.body.vacancies as Array<{ id: string }>).slice(0, 4);
  check('в ленте есть на чём проверить серию', burst.length >= 3, burst.length);

  const directions = ['RIGHT', 'LEFT', 'LEFT', 'RIGHT'] as const;
  const burstResults = await Promise.all(
    burst.map((v, i) => student.post('/api/swipes', { vacancyId: v.id, direction: directions[i] })),
  );
  check(
    'сервер принял все решения серии',
    burstResults.every((r) => r.status === 200),
    burstResults.map((r) => r.status),
  );

  const afterBurst = await student.request('/api/feed');
  const lost = burst.filter((v) =>
    (afterBurst.body.vacancies as Array<{ id: string }>).some((f) => f.id === v.id),
  );
  check('ни одно решение серии не потеряно', lost.length === 0, lost.map((v) => v.id));

  const burstApplied = await student.request('/api/applications');
  const burstSkipped = await student.request('/api/skipped');
  check(
    'решения разошлись по разделам, а не слиплись',
    burst
      .slice(0, 3)
      .every((v, i) =>
        directions[i] === 'RIGHT'
          ? burstApplied.body.applications?.some((a: any) => a.vacancy.id === v.id)
          : burstSkipped.body.skipped?.some((sk: any) => sk.vacancy.id === v.id),
      ),
  );

  // ---------- Файлы ----------
  // Фото и резюме — персональные данные. Ссылка не должна работать сама
  // по себе: право смотреть проверяется на каждый запрос, а чужой файл
  // обязан быть неотличим от несуществующего, иначе по коду ответа
  // перебором узнаётся, что у такого-то человека резюме есть.
  console.log('\nФайлы');
  check('гостю файл не отдают', (await guest.request('/api/files/photo/any.png')).status === 401);
  const foreignFile = await student.request('/api/files/photo/not-mine.png');
  check('чужой файл неотличим от несуществующего', foreignFile.status === 404, foreignFile.status);
  const foreignResume = await employer.request('/api/files/resume/not-mine.pdf');
  check('резюме чужого студента закрыто', foreignResume.status === 404, foreignResume.status);

  // ---------- Профиль ----------
  // Отдельный студент: удаление в конце раздела не должно выбить
  // из-под ног сессии, на которых держатся проверки выше.
  console.log('\nПрофиль');
  const owner = new Session();
  const ownerEmail = `smoke-profile-${Date.now()}@demo.ru`;
  const ownerProfile = {
    fullName: 'Профиль Проверочный',
    gender: 'FEMALE',
    birthDate: '2004-03-15',
    photoUrl: null,
    university: 'КФУ',
    speciality: 'Экономика',
    studyYear: 2,
    city: 'Казань',
    workDays: ['MON', 'TUE'],
    hoursPerWeek: 16,
    skills: ['Excel'],
    about: null,
    resumeUrl: null,
    resumeName: null,
    phone: '+7 900 555-44-33',
  };
  const ownerStarted = await owner.post('/api/auth/register', {
    ...ownerProfile,
    email: ownerEmail,
    password: 'Smoke12345!',
    consent: true,
    terms: true,
  });
  const ownerCode = codeFrom(await lastMail(ownerEmail, 'Код подтверждения'));
  const ownerCreated = await owner.post('/api/auth/register/confirm', { pending: ownerStarted.body?.pending, code: ownerCode });
  check('студент для проверки профиля заведён', ownerCreated.status === 201, ownerCreated.body);

  const minor = await new Session().post('/api/auth/register', {
    ...ownerProfile,
    birthDate: isoYearsAgo(18, 2),
    email: `smoke-minor-${Date.now()}@demo.ru`,
    password: 'Smoke12345!',
    consent: true,
    terms: true,
  });
  check('младше 18 регистрацию не проходит', minor.status === 400, minor.status);

  check('страница профиля открывается студенту', (await owner.request('/profile')).status === 200);
  const guestProfile = await new Session().request('/profile');
  check('гостя со страницы профиля уводят на вход', guestProfile.status === 307, guestProfile.status);
  check(
    'гостю менять профиль нельзя',
    (await new Session().patch('/api/students/me', ownerProfile)).status === 401,
  );

  const renamed = await owner.patch('/api/students/me', {
    ...ownerProfile,
    fullName: 'Профиль Изменённый',
    city: 'Казань',
    studyYear: 3,
  });
  check('изменения профиля сохраняются', renamed.status === 200, renamed.body);
  const me = await owner.request('/api/auth/me');
  // Имя в шапке берётся из сессионного токена — если его не переподписать,
  // человек сохранит новое имя и продолжит видеть старое
  check('новое имя сразу попадает в сессию', me.body.session?.name === 'Профиль Изменённый', me.body);

  const invalid = await owner.patch('/api/students/me', { ...ownerProfile, studyYear: 9 });
  check('кривые данные профиля отвергнуты', invalid.status === 400, invalid.status);

  // Правила даты и графика — через профиль: у регистрации лимит попыток
  // на адрес, а схема у них одна
  for (const [label, bad, field] of [
    ['дата рождения без дня отвергнута', { birthDate: '2004-03' }, 'birthDate'],
    ['несуществующая дата рождения отвергнута', { birthDate: '2004-02-30' }, 'birthDate'],
    ['возраст младше 18 в профиле не принимается', { birthDate: isoYearsAgo(16) }, 'birthDate'],
    ['часов больше, чем помещается в дни, — отвергнуто', { workDays: ['MON'], hoursPerWeek: 20 }, 'hoursPerWeek'],
  ] as const) {
    const res = await owner.patch('/api/students/me', { ...ownerProfile, fullName: 'Профиль Изменённый', ...bad });
    check(label, res.status === 400 && !!res.body?.fields?.[field], res.body);
  }
  const everyDay = await owner.patch('/api/students/me', {
    ...ownerProfile,
    fullName: 'Профиль Изменённый',
    workDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
    hoursPerWeek: 40,
  });
  check('график «каждый день, 40 часов» сохраняется', everyDay.status === 200, everyDay.body);

  const portfolio = {
    lookingFor: ['JOB', 'PROJECT'],
    goals: 'Хочу в продуктовую аналитику',
    projects: [{ title: 'Бот расписания для группы', description: 'Telegram-бот', link: 'https://example.org/bot' }],
    achievements: [{ title: 'Призёр студенческого хакатона', description: null, year: 2025 }],
    activities: [{ kind: 'SPORT', title: 'Плавание, 8 лет', description: null }],
    hobbies: 'Шахматы',
    links: [{ label: 'GitHub', url: 'https://example.org/gh' }],
    videoUrl: 'https://example.org/video',
  };
  const withPortfolio = await owner.patch('/api/students/me', { ...ownerProfile, fullName: 'Профиль Изменённый', ...portfolio });
  check('портфолио сохраняется', withPortfolio.status === 200, withPortfolio.body);
  const profilePage = await owner.request('/profile');
  check('портфолио видно в профиле', String(profilePage.body).includes('Бот расписания для группы'), profilePage.status);

  for (const [label, bad] of [
    ['ссылка javascript: отвергнута', { links: [{ label: 'x', url: 'javascript:alert(1)' }] }],
    ['видео javascript: отвергнуто', { videoUrl: 'javascript:alert(1)' }],
    ['ссылка проекта data: отвергнута', { projects: [{ title: 'Проект', description: null, link: 'data:text/html,<script>alert(1)</script>' }] }],
  ] as const) {
    const res = await owner.patch('/api/students/me', { ...ownerProfile, fullName: 'Профиль Изменённый', ...bad });
    check(label, res.status === 400, res.status);
  }

  const tooMany = await owner.patch('/api/students/me', {
    ...ownerProfile,
    fullName: 'Профиль Изменённый',
    projects: Array.from({ length: 11 }, (_, i) => ({ title: `Проект ${i + 1}`, description: null, link: null })),
  });
  check('больше 10 проектов не принимается', tooMany.status === 400, tooMany.status);

  // Изменение без полей портфолио — например, старым клиентом — не должно его стирать
  const partial = await owner.patch('/api/students/me', { ...ownerProfile, fullName: 'Профиль Изменённый', city: 'Москва' });
  const afterPartial = await owner.request('/profile');
  check(
    'частичное изменение не стирает портфолио',
    partial.status === 200 && String(afterPartial.body).includes('Бот расписания для группы'),
    partial.status,
  );

  // ---------- Учебные заведения ----------
  const institutionsList = await new Session().request('/api/institutions');
  const schools = (institutionsList.body?.institutions ?? []) as Array<{ id: string; slug: string; city: string }>;
  check('справочник вузов открыт', institutionsList.status === 200 && schools.length >= 10, schools.length);
  check('в справочнике пилота только Казань', schools.length > 0 && schools.every((s) => s.city === 'Казань'), schools.map((s) => s.city));
  check('список вузов открывается', String((await new Session().request('/institutions')).body).includes('КФУ'));
  const kfuPage = await new Session().request('/institutions/kpfu');
  check('страница вуза открывается', kfuPage.status === 200 && String(kfuPage.body).includes('Приволжский) федеральный университет'), kfuPage.status);
  check('несуществующий вуз — 404', (await new Session().request('/institutions/no-such-school')).status === 404);
  const ratingPage = await new Session().request('/institutions/rating');
  check('рейтинг вузов открыт гостю', ratingPage.status === 200 && String(ratingPage.body).includes('Рейтинг учебных заведений'), ratingPage.status);
  check('на странице вуза есть статистика студентов', String(kfuPage.body).includes('Студенты на платформе'));

  const ownerId = (await owner.request('/api/auth/me')).body.session?.profileId as string;
  const findOwner = async () =>
    (((await admin.request('/api/admin/students')).body?.students ?? []) as Array<Record<string, any>>).find(
      (s) => s.id === ownerId,
    );
  const bogusSchool = await owner.patch('/api/students/me', {
    ...ownerProfile,
    fullName: 'Профиль Изменённый',
    institutionId: 'no-such-institution',
  });
  check('несуществующий вуз из справочника отвергнут', bogusSchool.status === 400 && !!bogusSchool.body?.fields?.university, bogusSchool.body);

  const kfu = schools.find((s) => s.slug === 'kpfu');
  check('КФУ есть в справочнике', !!kfu);
  if (kfu) {
    const picked = await owner.patch('/api/students/me', {
      ...ownerProfile,
      fullName: 'Профиль Изменённый',
      university: 'кфу',
      institutionId: kfu.id,
    });
    check('вуз из справочника сохраняется', picked.status === 200, picked.body);
    const afterPick = await findOwner();
    check('название вуза берётся из справочника', afterPick?.university === 'КФУ' && afterPick?.institutionId === kfu.id, afterPick);

    check('студент не подтверждает учёбу сам', (await owner.patch('/api/admin/students', { studentId: ownerId, studyVerified: true })).status === 401);
    check('работодатель не подтверждает учёбу', (await employer.patch('/api/admin/students', { studentId: ownerId, studyVerified: true })).status === 401);
    const verified = await admin.patch('/api/admin/students', { studentId: ownerId, studyVerified: true });
    check('HR подтверждает учёбу', verified.status === 200 && (await findOwner())?.studyVerified === true, verified.body);

    await owner.patch('/api/students/me', { ...ownerProfile, fullName: 'Профиль Изменённый', university: 'КФУ', institutionId: kfu.id });
    check('сохранение без смены вуза отметку не снимает', (await findOwner())?.studyVerified === true);

    const moved = await owner.patch('/api/students/me', {
      ...ownerProfile,
      fullName: 'Профиль Изменённый',
      university: 'Колледж связи',
      institutionId: null,
    });
    const afterMove = await findOwner();
    check(
      'смена вуза снимает подтверждение учёбы',
      moved.status === 200 && afterMove?.studyVerified === false && afterMove?.institutionId === null,
      afterMove,
    );
  }
  check('HR открывает список студентов', (await admin.request('/admin/students')).status === 200);
  const statsWithSchools = (await admin.request('/api/admin/stats')).body;
  check(
    'в статистике есть студенты по вузам',
    Array.isArray(statsWithSchools?.institutions ?? statsWithSchools?.stats?.institutions),
    statsWithSchools,
  );
  const boardWithSchool = await employer.request('/api/employer/applications');
  check(
    'работодатель видит отметку о подтверждении учёбы',
    typeof boardWithSchool.body?.applications?.[0]?.student?.studyVerified === 'boolean',
  );
  const boardStudent = boardWithSchool.body?.applications?.[0]?.student;
  check(
    'работодатель видит возраст, но не дату рождения',
    typeof boardStudent?.age === 'number' && boardStudent?.birthDate === null,
    boardStudent && { age: boardStudent.age, birthDate: boardStudent.birthDate },
  );
  // Справочник вузов убрали из регистрации — вуз выбирают в профиле после неё
  check('на регистрации справочника вузов нет', !String((await new Session().request('/register')).body).includes('КНИТУ'));
  check('справочник вузов есть в профиле', String((await owner.request('/profile')).body).includes('КНИТУ'));

  const erased = await owner.delete('/api/students/me', {});
  check('профиль удаляется', erased.status === 200, erased.body);
  check('после удаления сессии нет', (await owner.request('/api/auth/me')).body.session === null);
  const afterErase = await new Session().post('/api/auth/login', {
    email: ownerEmail,
    password: 'Smoke12345!',
  });
  check('войти в удалённый профиль нельзя', afterErase.status === 401, afterErase.status);
  const reRegisterStarted = await new Session().post('/api/auth/register', {
    ...ownerProfile,
    email: ownerEmail,
    password: 'Smoke12345!',
    consent: true,
    terms: true,
  });
  // Почта освобождается вместе с данными: иначе удалённый человек не
  // смог бы вернуться, а его адрес так и остался бы лежать в базе
  check('после удаления почту можно занять снова', reRegisterStarted.status === 201 && !!reRegisterStarted.body?.pending, reRegisterStarted.body);
  if (reRegisterStarted.body?.pending) {
    const reRegisterCode = codeFrom(await lastMail(ownerEmail, 'Код подтверждения'));
    const again = new Session();
    const reRegisterConfirmed = await again.post('/api/auth/register/confirm', {
      pending: reRegisterStarted.body.pending,
      code: reRegisterCode,
    });
    check('повторная регистрация подтверждается кодом', reRegisterConfirmed.status === 201, reRegisterConfirmed.body);
    await again.delete('/api/students/me', {});
  }

  // ---------- Компания ----------
  // Самостоятельная регистрация: кабинет открывается сразу, а публичной
  // страница становится только после одобрения агентством.
  console.log('\nКомпания');
  const companyEmail = `smoke-company-${Date.now()}@demo.ru`;
  const companyInn = randomInn();
  const companyData = {
    companyName: 'Проверочная Компания',
    contactName: 'Иван Проверкин',
    email: companyEmail,
    password: 'Smoke12345!',
    industry: 'IT',
    city: 'Казань',
    inn: companyInn,
    phone: '+7 900 777-66-55',
    consent: true,
    terms: true,
  };
  const company = new Session();
  const companyStarted = await company.post('/api/auth/register/company', companyData);
  check('компания регистрируется сама: код отправлен', companyStarted.status === 201 && !!companyStarted.body?.pending, companyStarted.body);
  const companyCode = codeFrom(await lastMail(companyEmail, 'Код подтверждения'));
  check('компании пришёл код подтверждения почты', !!companyCode);
  const companyReg = await company.post('/api/auth/register/company/confirm', {
    pending: companyStarted.body?.pending,
    code: companyCode,
  });
  check('компания подтверждает код и получает кабинет', companyReg.status === 201, companyReg.body);
  check('новая компания на модерации', companyReg.body?.moderationStatus === 'PENDING', companyReg.body);

  const companyNoConsent = await new Session().post('/api/auth/register/company', {
    ...companyData,
    email: `smoke-company-${Date.now() + 1}@demo.ru`,
    consent: false,
    terms: false,
  });
  check('без согласия компанию не регистрируют', companyNoConsent.status === 400, companyNoConsent.status);
  const companyDup = await new Session().post('/api/auth/register/company', companyData);
  check('почту компании нельзя занять повторно', companyDup.status === 409, companyDup.status);
  const innDup = await new Session().post('/api/auth/register/company', {
    ...companyData,
    email: `smoke-company-${Date.now() + 2}@demo.ru`,
  });
  check('ИНН компании нельзя занять повторно', innDup.status === 409 && !!innDup.body?.fields?.inn, innDup.body);

  const companyLogin = await new Session().post('/api/auth/login', { email: companyEmail, password: 'Smoke12345!' });
  check('компания входит по почте и паролю', companyLogin.status === 200 && companyLogin.body?.role === 'EMPLOYER', companyLogin.body);
  check('кабинет компании открывается', (await company.request('/employer/company')).status === 200);

  const companyId = (await company.request('/api/auth/me')).body.session?.profileId as string;
  const companyPage = {
    companyName: 'Проверочная Компания',
    contactName: 'Иван Проверкин',
    phone: '+7 900 777-66-55',
    logoUrl: null,
    industry: 'IT',
    about: 'Сервисы для студентов',
    culture: 'Наставник у каждого стажёра',
    website: 'https://example.org',
    city: 'Казань',
    socials: [{ label: 'VK', url: 'https://example.org/vk' }],
    photos: [],
    videoUrl: null,
  };
  const companySaved = await company.patch('/api/employer/company', companyPage);
  check('страница компании сохраняется', companySaved.status === 200, companySaved.body);
  const badInn = await company.patch('/api/employer/company', { ...companyPage, inn: '1234567890' });
  check('ИНН с неверной контрольной цифрой отвергнут', badInn.status === 400 && !!badInn.body?.fields?.inn, badInn.body);
  const phoneErased = await company.patch('/api/employer/company', { ...companyPage, phone: '' });
  check('телефон компании нельзя стереть', phoneErased.status === 400 && !!phoneErased.body?.fields?.phone, phoneErased.body);
  check('компания на модерации не публична', (await new Session().request(`/companies/${companyId}`)).status === 404);

  const stolen = await company.patch('/api/employer/company', {
    ...companyPage,
    logoUrl: '/api/files/photo/00000000-0000-0000-0000-000000000000.jpg',
  });
  check('логотипом нельзя сделать чужой файл', stolen.status === 400, stolen.status);
  const badSite = await company.patch('/api/employer/company', { ...companyPage, website: 'javascript:alert(1)' });
  check('сайт javascript: отвергнут', badSite.status === 400, badSite.status);

  const crmId = (await employer.request('/api/auth/me')).body.session?.profileId as string;
  const crmPage = await new Session().request(`/companies/${crmId}`);
  check('страница одобренной компании открыта гостю', crmPage.status === 200 && String(crmPage.body).includes('Кофейни'), crmPage.status);

  // Картинки компании раздаются публично — загружать их может только кабинет
  const png = new Uint8Array(
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  );
  const uploadForm = () => {
    const fd = new FormData();
    fd.append('kind', 'company');
    fd.append('file', new Blob([png], { type: 'image/png' }), 'logo.png');
    return fd;
  };
  const guestUpload = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { Origin: BASE }, body: uploadForm() });
  check('гость не загружает изображения компании', guestUpload.status === 401, guestUpload.status);
  const companyUpload = await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers: { Origin: BASE, Cookie: (company as any).cookie },
    body: uploadForm(),
  });
  check('кабинет компании загружает изображение', companyUpload.status === 201, companyUpload.status);
  if (companyUpload.status === 201) {
    const { url } = (await companyUpload.json()) as { url: string };
    const withLogo = await company.patch('/api/employer/company', { ...companyPage, logoUrl: url });
    check('логотип сохраняется', withLogo.status === 200, withLogo.body);
    check('логотип компании на модерации гостю не отдаётся', (await fetch(`${BASE}${url}`)).status === 404);
    check('свой логотип компания видит', (await company.request(url)).status === 200);
  }

  // ---------- Вакансии из кабинета и модерация ----------
  console.log('\nВакансии и модерация');
  const photoUpload = await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers: { Origin: BASE, Cookie: (company as any).cookie },
    body: uploadForm(),
  });
  const vacancyPhoto = photoUpload.status === 201 ? ((await photoUpload.json()) as { url: string }).url : null;
  check('фото для вакансии загружается', !!vacancyPhoto, photoUpload.status);

  const vacancyForm = {
    title: 'Стажёр-аналитик',
    summary: 'Помогать команде разбирать данные о студентах и готовить отчёты.',
    responsibilities: ['Собирать выгрузки', 'Готовить еженедельный отчёт'],
    requirements: ['Excel'],
    perks: ['Гибкий график'],
    learnings: ['SQL на реальных данных'],
    team: 'Аналитик-наставник и два стажёра',
    salaryFrom: 30000,
    salaryTo: 45000,
    salaryPeriod: 'MONTH',
    city: 'Казань',
    district: null,
    address: 'ул. Баумана, 44',
    addressDetails: 'офис 5',
    workFormat: 'HYBRID',
    employmentType: 'INTERNSHIP',
    shiftDays: ['MON', 'WED', 'FRI'],
    hoursPerWeek: 20,
    tags: ['Excel', 'SQL'],
    photos: vacancyPhoto ? [vacancyPhoto] : [],
    videoUrl: null,
  };
  check('гость не создаёт вакансию', (await new Session().post('/api/employer/vacancies', vacancyForm)).status === 401);
  check('студент не создаёт вакансию', (await student.post('/api/employer/vacancies', vacancyForm)).status === 401);

  const draft = await company.post('/api/employer/vacancies', vacancyForm);
  check('черновик вакансии сохраняется', draft.status === 201 && draft.body?.status === 'DRAFT', draft.body);
  const vacancyId = String(draft.body?.id);
  const sneaky = await company.post('/api/employer/vacancies', { ...vacancyForm, status: 'PUBLISHED', isActive: true });
  check('опубликовать в обход проверки нельзя', sneaky.status === 201 && sneaky.body?.status === 'DRAFT', sneaky.body);

  const badSalary = await company.post('/api/employer/vacancies', { ...vacancyForm, salaryFrom: 50000, salaryTo: 10000 });
  check('зарплата «до» меньше «от» отвергнута', badSalary.status === 400 && !!badSalary.body?.fields?.salaryTo, badSalary.body);
  const badVideo = await company.post('/api/employer/vacancies', { ...vacancyForm, videoUrl: 'javascript:alert(1)' });
  check('видео вакансии javascript: отвергнуто', badVideo.status === 400, badVideo.status);
  const foreignPhoto = await company.post('/api/employer/vacancies', {
    ...vacancyForm,
    photos: ['/api/files/photo/00000000-0000-0000-0000-000000000000.jpg'],
  });
  check('фото вакансии — только файлы компании', foreignPhoto.status === 400, foreignPhoto.status);
  const noDays = await company.post('/api/employer/vacancies', { ...vacancyForm, shiftDays: [] });
  check('вакансия без дней смен отвергнута', noDays.status === 400, noDays.status);
  const noAddress = await company.post('/api/employer/vacancies', { ...vacancyForm, address: null });
  check('вакансия на месте без адреса отвергнута', noAddress.status === 400 && !!noAddress.body?.fields?.address, noAddress.body);
  const remoteDraft = await company.post('/api/employer/vacancies', { ...vacancyForm, workFormat: 'REMOTE', address: null, addressDetails: null });
  check('удалённая вакансия сохраняется без адреса', remoteDraft.status === 201, remoteDraft.body);

  check('раздел вакансий открывается', (await company.request('/employer/vacancies')).status === 200);
  check('форма новой вакансии открывается', (await company.request('/employer/vacancies/new')).status === 200);
  check('своя вакансия открывается на правку', (await company.request(`/employer/vacancies/${vacancyId}`)).status === 200);
  // Кабинет стримится через loading.tsx, поэтому notFound() приходит
  // страницей «не найдено» со статусом 200 — проверяем содержимое, а не код
  const foreignEdit = await employer.request(`/employer/vacancies/${vacancyId}`);
  const foreignEditBody = String(foreignEdit.body);
  check(
    'чужая вакансия на правку не открывается',
    (foreignEdit.status === 404 || foreignEditBody.includes('NEXT_NOT_FOUND')) &&
      !foreignEditBody.includes('Стажёр-аналитик'),
    foreignEdit.status,
  );
  if (vacancyPhoto) check('фото черновика гостю не отдаётся', (await fetch(`${BASE}${vacancyPhoto}`)).status === 404);

  // Почта компании подтверждена ещё кодом при регистрации — подача на
  // проверку ничего дополнительно не ждёт
  const submitted = await company.post(`/api/employer/vacancies/${vacancyId}`, { action: 'submit' });
  check('вакансия уходит на проверку — почта уже подтверждена при регистрации', submitted.status === 200 && submitted.body?.status === 'PENDING', submitted.body);

  const inFeed = async () => {
    const feed = await student.request('/api/feed');
    return ((feed.body?.vacancies ?? []) as Array<{ id: string }>).some((v) => v.id === vacancyId);
  };
  check('вакансия на проверке не в ленте', !(await inFeed()));
  check('чужую вакансию не изменить', (await employer.patch(`/api/employer/vacancies/${vacancyId}`, vacancyForm)).status === 404);
  check('чужую вакансию не снять', (await employer.post(`/api/employer/vacancies/${vacancyId}`, { action: 'close' })).status === 404);

  check('студенту модерация закрыта', (await student.request('/api/admin/moderation')).status === 401);
  check(
    'компании модерация закрыта',
    (await company.post('/api/admin/moderation', { entity: 'company', id: companyId, decision: 'APPROVE' })).status === 401,
  );

  const queue = await admin.request('/api/admin/moderation');
  check(
    'компания в очереди модерации',
    queue.status === 200 && ((queue.body?.companies ?? []) as Array<{ id: string }>).some((c) => c.id === companyId),
    queue.status,
  );
  check(
    'вакансия в очереди модерации',
    ((queue.body?.vacancies ?? []) as Array<{ vacancy: { id: string } }>).some((v) => v.vacancy.id === vacancyId),
  );
  const queuedCompany = ((queue.body?.companies ?? []) as Array<{ id: string; inn: string | null; phone: string | null }>).find(
    (c) => c.id === companyId,
  );
  check(
    'в очереди у компании ИНН и телефон для проверки',
    queuedCompany?.inn === companyInn && queuedCompany?.phone === '+7 900 777-66-55',
    queuedCompany,
  );
  check('страница модерации открывается', (await admin.request('/admin/moderation')).status === 200);
  const statsBody = (await admin.request('/api/admin/stats')).body;
  const moderationStats = statsBody?.moderation ?? statsBody?.stats?.moderation;
  check('в статистике есть очередь модерации', typeof moderationStats?.vacancies === 'number', statsBody);

  const earlyApprove = await admin.post('/api/admin/moderation', { entity: 'vacancy', id: vacancyId, decision: 'APPROVE' });
  check('вакансию не одобрить раньше компании', earlyApprove.status === 409, earlyApprove.body);
  const silentReject = await admin.post('/api/admin/moderation', { entity: 'vacancy', id: vacancyId, decision: 'REJECT' });
  check('отказ без причины не принимается', silentReject.status === 400, silentReject.status);
  const rejected = await admin.post('/api/admin/moderation', {
    entity: 'vacancy',
    id: vacancyId,
    decision: 'REJECT',
    note: 'Уточните обязанности стажёра',
  });
  check('вакансия отклоняется с причиной', rejected.status === 200 && rejected.body?.status === 'REJECTED', rejected.body);
  const vacancyRejectMail = await lastMail(companyEmail, 'Вакансию вернули');
  check('компании пришло письмо о возвращённой вакансии', !!vacancyRejectMail?.text.includes('Уточните обязанности стажёра'), vacancyRejectMail?.subject);
  const ownList = (await company.request('/api/employer/vacancies')).body?.vacancies ?? [];
  const listed = (ownList as Array<{ id: string; status: string; moderationNote: string | null }>).find((v) => v.id === vacancyId);
  check(
    'причина отказа видна компании',
    listed?.status === 'REJECTED' && listed?.moderationNote === 'Уточните обязанности стажёра',
    listed,
  );

  const resubmitted = await company.patch(`/api/employer/vacancies/${vacancyId}`, {
    ...vacancyForm,
    responsibilities: ['Собирать выгрузки из CRM', 'Готовить еженедельный отчёт'],
    submit: true,
  });
  check('исправленная вакансия снова на проверке', resubmitted.status === 200 && resubmitted.body?.status === 'PENDING', resubmitted.body);

  const companyRejected = await admin.post('/api/admin/moderation', {
    entity: 'company',
    id: companyId,
    decision: 'REJECT',
    note: 'Добавьте, чем занимается команда',
  });
  check('компанию можно отклонить с причиной', companyRejected.status === 200 && companyRejected.body?.status === 'REJECTED', companyRejected.body);
  const companyRejectMail = await lastMail(companyEmail, 'Компанию вернули');
  check('компании пришло письмо о доработке с причиной', !!companyRejectMail?.text.includes('Добавьте, чем занимается команда'), companyRejectMail?.subject);
  const companyResubmitted = await company.patch('/api/employer/company', companyPage);
  check(
    'отклонённая компания после правки снова на проверке',
    companyResubmitted.status === 200 && companyResubmitted.body?.moderationStatus === 'PENDING',
    companyResubmitted.body,
  );

  const companyApproved = await admin.post('/api/admin/moderation', { entity: 'company', id: companyId, decision: 'APPROVE' });
  check('компания одобряется', companyApproved.status === 200 && companyApproved.body?.status === 'APPROVED', companyApproved.body);
  check('компании пришло письмо об одобрении', !!(await lastMail(companyEmail, 'Компания прошла проверку')));
  check('одобренная компания открыта гостю', (await new Session().request(`/companies/${companyId}`)).status === 200);
  const innLocked = await company.patch('/api/employer/company', { ...companyPage, inn: randomInn() });
  const lockedPage = String((await company.request('/employer/company')).body);
  check(
    'ИНН одобренной компании из кабинета не меняется',
    innLocked.status === 200 && innLocked.body?.moderationStatus === 'APPROVED' && lockedPage.includes(companyInn),
    innLocked.body,
  );
  const vacancyApproved = await admin.post('/api/admin/moderation', { entity: 'vacancy', id: vacancyId, decision: 'APPROVE' });
  check('вакансия одобряется', vacancyApproved.status === 200 && vacancyApproved.body?.status === 'PUBLISHED', vacancyApproved.body);
  check('компании пришло письмо о публикации вакансии', !!(await lastMail(companyEmail, 'Вакансия опубликована')));
  check('одобренная вакансия в ленте', await inFeed());
  const twice = await admin.post('/api/admin/moderation', {
    entity: 'vacancy',
    id: vacancyId,
    decision: 'REJECT',
    note: 'Повторное решение',
  });
  check('повторное решение по вакансии отвергнуто', twice.status === 409, twice.status);
  if (vacancyPhoto) check('фото опубликованной вакансии открыто', (await fetch(`${BASE}${vacancyPhoto}`)).status === 200);

  const feedCard = (((await student.request('/api/feed')).body?.vacancies ?? []) as Array<Record<string, any>>).find(
    (v) => v.id === vacancyId,
  );
  check(
    'в карточке «чему научитесь» и команда',
    feedCard?.learnings?.[0] === 'SQL на реальных данных' && feedCard?.team === 'Аналитик-наставник и два стажёра',
    feedCard,
  );
  check('в карточке вакансии адрес', feedCard?.address === 'ул. Баумана, 44' && feedCard?.addressDetails === 'офис 5', feedCard);
  const publicCompany = await new Session().request(`/companies/${companyId}`);
  check('вакансия видна на странице компании', String(publicCompany.body).includes('Стажёр-аналитик'), publicCompany.status);

  const edited = await company.patch(`/api/employer/vacancies/${vacancyId}`, { ...vacancyForm, title: 'Стажёр-аналитик данных' });
  check('правка опубликованной вакансии отправляет её на проверку', edited.status === 200 && edited.body?.status === 'PENDING', edited.body);
  check('после правки вакансии нет в ленте', !(await inFeed()));
  await admin.post('/api/admin/moderation', { entity: 'vacancy', id: vacancyId, decision: 'APPROVE' });
  check('после повторного одобрения вакансия снова в ленте', await inFeed());

  // Финальный тест с доски Miro: студент откликается на вакансию компании,
  // которая зарегистрировалась сама, — компания видит отклик и отвечает
  // студенту, и никому не нужна помощь разработчика
  const finalSwipe = await student.post('/api/swipes', { vacancyId, direction: 'RIGHT' });
  check('финальный тест: студент откликается на вакансию новой компании', finalSwipe.status === 200 && finalSwipe.body?.applied === true, finalSwipe.body);
  check('компании пришло письмо о новом отклике', !!(await lastMail(companyEmail, 'Новый отклик')));
  const companyBoard = ((await company.request('/api/employer/applications')).body?.applications ?? []) as Array<{
    id: string;
    vacancyId: string;
    status: string;
  }>;
  const finalApplication = companyBoard.find((a) => a.vacancyId === vacancyId);
  check('финальный тест: отклик появился в кабинете компании', !!finalApplication, companyBoard.length);
  if (finalApplication) {
    const invited = await company.patch('/api/employer/applications', { applicationId: finalApplication.id, status: 'INVITED' });
    check('финальный тест: компания приглашает студента', invited.status === 200, invited.body);
    check('студенту пришло письмо о приглашении', !!(await lastMail(email, 'Вас приглашают')));
    const studentApps = ((await student.request('/api/applications')).body?.applications ?? []) as Array<{ id: string; status: string }>;
    check('финальный тест: студент видит приглашение', studentApps.some((a) => a.id === finalApplication.id && a.status === 'INVITED'));
    const hello = await company.post(`/api/messages/${finalApplication.id}`, { body: 'Здравствуйте! Приглашаем на знакомство в среду.' });
    check('финальный тест: компания пишет студенту', hello.status === 201, hello.body);
    const thread = await student.request(`/api/messages/${finalApplication.id}`);
    check(
      'финальный тест: студент получает сообщение',
      thread.status === 200 && JSON.stringify(thread.body).includes('Приглашаем на знакомство'),
      thread.status,
    );
  }

  // Правка опубликованной вакансии не доходит до откликнувшихся до проверки
  const unreviewed = await company.patch(`/api/employer/vacancies/${vacancyId}`, { ...vacancyForm, title: 'Непроверенная правка' });
  check('правка вакансии с откликами уходит на проверку', unreviewed.status === 200 && unreviewed.body?.status === 'PENDING', unreviewed.body);
  const appsAfterEdit = ((await student.request('/api/applications')).body?.applications ?? []) as Array<{
    vacancy: { id: string; title: string };
  }>;
  const shownTitle = appsAfterEdit.find((a) => a.vacancy.id === vacancyId)?.vacancy.title;
  check('откликнувшийся видит одобренную версию, а не правку', shownTitle === 'Стажёр-аналитик данных', shownTitle);
  if (finalApplication) {
    const threadAfterEdit = await student.request(`/api/messages/${finalApplication.id}`);
    check(
      'в переписке у студента название до проверки не меняется',
      threadAfterEdit.status === 200 && !JSON.stringify(threadAfterEdit.body).includes('Непроверенная правка'),
      threadAfterEdit.status,
    );
  }
  const queueSeen = ((await admin.request('/api/admin/moderation')).body?.vacancies ?? []) as Array<{
    version: string;
    vacancy: { id: string };
  }>;
  const seenVersion = queueSeen.find((v) => v.vacancy.id === vacancyId)?.version;
  check('в очереди модерации есть версия вакансии', typeof seenVersion === 'string', seenVersion);
  await company.patch(`/api/employer/vacancies/${vacancyId}`, { ...vacancyForm, title: 'Непроверенная правка 2' });
  const staleApprove = await admin.post('/api/admin/moderation', {
    entity: 'vacancy',
    id: vacancyId,
    decision: 'APPROVE',
    version: seenVersion,
  });
  check('одобрить версию, которую HR не видел, нельзя', staleApprove.status === 409, staleApprove.body);

  const renamedCompany = await company.patch('/api/employer/company', { ...companyPage, companyName: 'Проверочная Компания Плюс' });
  check(
    'смена названия возвращает компанию на проверку',
    renamedCompany.status === 200 && renamedCompany.body?.moderationStatus === 'PENDING',
    renamedCompany.body,
  );
  check('вакансии компании на проверке нет в ленте', !(await inFeed()));
  const hiddenSwipe = await student.post('/api/swipes', { vacancyId, direction: 'RIGHT' });
  check('откликнуться на скрытую вакансию нельзя', hiddenSwipe.status === 404, hiddenSwipe.status);
  if (vacancyPhoto) check('фото вакансии скрытой компании гостю не отдаётся', (await fetch(`${BASE}${vacancyPhoto}`)).status === 404);

  const closedVacancy = await company.post(`/api/employer/vacancies/${vacancyId}`, { action: 'close' });
  check('вакансия снимается', closedVacancy.status === 200 && closedVacancy.body?.status === 'CLOSED', closedVacancy.body);

  const crmVacancies = ((await employer.request('/api/employer/vacancies')).body?.vacancies ?? []) as Array<{ id: string; fromCrm: boolean }>;
  const crmVacancy = crmVacancies.find((v) => v.fromCrm);
  check('клиент CRM видит свои вакансии в кабинете', !!crmVacancy, crmVacancies.length);
  if (crmVacancy) {
    const crmEdit = await employer.patch(`/api/employer/vacancies/${crmVacancy.id}`, vacancyForm);
    check('вакансию из CRM из кабинета не изменить', crmEdit.status === 409, crmEdit.status);
  }

  // ---------- Метрики пилота ----------
  console.log('\nМетрики пилота');
  const severId = (await employer.request('/api/auth/me')).body.session?.profileId as string;
  const severVacancy = (((await student.request('/api/feed')).body?.vacancies ?? []) as Array<{ id: string; companyId: string | null }>).find(
    (v) => v.companyId === severId,
  );
  if (severVacancy) await student.post('/api/swipes', { vacancyId: severVacancy.id, direction: 'RIGHT' });
  const freshApplication = (((await employer.request('/api/employer/applications')).body?.applications ?? []) as Array<{ id: string; status: string }>).find(
    (a) => a.status === 'NEW',
  );
  check('у работодателя есть новый отклик', !!freshApplication);
  if (freshApplication) {
    const foreignView = await company.post('/api/employer/applications/view', { applicationId: freshApplication.id });
    check('чужой отклик не отметить просмотренным', foreignView.status === 403, foreignView.status);
    const viewed = await employer.post('/api/employer/applications/view', { applicationId: freshApplication.id });
    check('открытие карточки отмечает отклик просмотренным', viewed.status === 200 && viewed.body?.status === 'VIEWED', viewed.body);
    const viewedAgain = await employer.post('/api/employer/applications/view', { applicationId: freshApplication.id });
    check('повторное открытие статус не меняет', viewedAgain.status === 200 && viewedAgain.body?.status === 'VIEWED', viewedAgain.body);
  }

  check('метрики пилота закрыты для работодателя', (await employer.request('/api/admin/pilot')).status === 401);
  check('метрики пилота закрыты для студента', (await student.request('/api/admin/pilot')).status === 401);
  const pilot = await admin.request('/api/admin/pilot');
  check(
    'метрики пилота считаются',
    pilot.status === 200 && typeof pilot.body?.students?.registered === 'number' && 'firstOpportunityDays' in (pilot.body?.timing ?? {}),
    pilot.body,
  );
  const eventTypes = ((pilot.body?.events ?? []) as Array<{ type: string }>).map((e) => e.type);
  check('в журнале есть публикация вакансии', eventTypes.includes('vacancy.published'), eventTypes.slice(0, 12));
  check('в журнале есть регистрация компании', eventTypes.includes('company.registered'), eventTypes.slice(0, 12));
  check('в журнале есть следующий шаг по отклику', eventTypes.includes('application.next_step'), eventTypes.slice(0, 12));
  if (freshApplication) check('в журнале есть просмотр профиля', eventTypes.includes('profile.viewed'), eventTypes.slice(0, 12));
  if (severVacancy) check('в журнале есть отклик', eventTypes.includes('application.created'), eventTypes.slice(0, 12));
  check(
    'доля приглашённых не больше 100%',
    Number(pilot.body?.students?.gotOpportunity) <= Number(pilot.body?.students?.applied),
    pilot.body?.students,
  );
  check('страница метрик пилота открывается', (await admin.request('/admin/pilot')).status === 200);

  // ---------- Вход сотрудника из CRM ----------
  console.log('\nВход из CRM');
  const ssoSecret = process.env.STUDENTS_SSO_SECRET?.trim() ?? '';
  const crmTicket = (claims: Record<string, unknown>, secret = ssoSecret) => {
    const now = Math.floor(Date.now() / 1000);
    const body = Buffer.from(
      JSON.stringify({
        v: 1, iss: 'fattakhov-crm', aud: 'fattakhov-students', kind: 'staff', sub: 'usr_smoke', email: `smoke-${Date.now() + 4242}@demo.ru`,
        name: 'Сотрудник Проверкин', position: 'Администратор', permissions: ['students'], iat: now, exp: now + 60,
        jti: crypto.randomBytes(16).toString('base64url'), ...claims,
      }),
    ).toString('base64url');
    return `${body}.${crypto.createHmac('sha256', secret || 'секрет-не-задан').update(body).digest('base64url')}`;
  };
  const crmClientTicket = (claims: Record<string, unknown>, secret = ssoSecret) => {
    const now = Math.floor(Date.now() / 1000);
    const body = Buffer.from(
      JSON.stringify({
        v: 1, iss: 'fattakhov-crm', aud: 'fattakhov-students', kind: 'client', sub: 'usr_smoke_client',
        crmClientId: `crm-client-smoke-${Date.now() + 4242}`, companyName: 'Смоук-клиент CRM',
        contactName: 'Проверкина Клиентова', contactEmail: `smoke-client-${Date.now() + 4242}@demo.ru`,
        iat: now, exp: now + 60, jti: crypto.randomBytes(16).toString('base64url'), ...claims,
      }),
    ).toString('base64url');
    return `${body}.${crypto.createHmac('sha256', secret || 'секрет-не-задан').update(body).digest('base64url')}`;
  };
  const enterFromCrm = async (ticket: string) => {
    const response = await fetch(`${BASE}/api/auth/crm?ticket=${encodeURIComponent(ticket)}`, { redirect: 'manual' });
    return {
      status: response.status,
      location: response.headers.get('location') ?? '',
      cookie: (response.headers.get('set-cookie') ?? '').split(';')[0],
    };
  };
  if (ssoSecret.length >= 32) {
    const staffEmail = `smoke-${Date.now() + 4242}@demo.ru`;
    const firstTicket = crmTicket({ email: staffEmail });
    const entered = await enterFromCrm(firstTicket);
    check(
      'сотрудник из CRM входит в панель по билету',
      [303, 307].includes(entered.status) && entered.location.endsWith('/admin/students') && entered.cookie.startsWith('fhr_session='),
      entered.status,
    );
    const staff = new Session();
    (staff as any).cookie = entered.cookie;
    check('выданный раздел открыт', (await staff.request('/api/admin/students')).status === 200);
    check('невыданный раздел закрыт', (await staff.request('/api/admin/moderation')).status === 403);
    check('метрики пилота без доступа закрыты', (await staff.request('/api/admin/pilot')).status === 403);
    const staffStats = await staff.request('/api/admin/stats');
    check('панель открыта, журнал без доступа к пилоту скрыт', staffStats.status === 200 && (staffStats.body?.audit ?? []).length === 0, staffStats.status);
    // Кабинет стримится, поэтому redirect() приходит страницей с NEXT_REDIRECT и кодом 200
    const deniedPage = await staff.request('/admin/moderation');
    check(
      'страница невыданного раздела уводит на панель',
      [303, 307].includes(deniedPage.status) || String(deniedPage.body).includes('NEXT_REDIRECT'),
      deniedPage.status,
    );
    const replay = await enterFromCrm(firstTicket);
    check('по тому же билету второй раз не войти', replay.location.includes('crm=used'), replay.location);
    const past = Math.floor(Date.now() / 1000) - 120;
    const expired = await enterFromCrm(crmTicket({ email: staffEmail, iat: past, exp: past + 60 }));
    check('просроченный билет не пускает', expired.location.includes('crm=expired'), expired.location);
    const forged = await enterFromCrm(crmTicket({ email: staffEmail, permissions: ['moderation', 'students', 'pilot'] }, 'x'.repeat(40)));
    check('поддельный билет не пускает', forged.location.includes('crm=expired'), forged.location);
    const conflict = await enterFromCrm(crmTicket({ email }));
    check('почта студента не становится входом в панель', conflict.location.includes('crm=conflict'), conflict.location);

    // ---------- Вход клиента CRM: публикация вакансии без модерации ----------
    const firstClientTicket = crmClientTicket({});
    const clientEntered = await enterFromCrm(firstClientTicket);
    check(
      'клиент CRM входит сразу в форму новой вакансии',
      [303, 307].includes(clientEntered.status) &&
        clientEntered.location.endsWith('/employer/vacancies/new') &&
        clientEntered.cookie.startsWith('fhr_session='),
      clientEntered.status,
    );
    const clientSession = new Session();
    (clientSession as any).cookie = clientEntered.cookie;
    check('кабинет компании клиента CRM открыт', (await clientSession.request('/employer')).status === 200);
    const clientReplay = await enterFromCrm(firstClientTicket);
    check('по тому же билету клиента второй раз не войти', clientReplay.location.includes('crm=used'), clientReplay.location);
  } else {
    const notConfigured = await enterFromCrm(crmTicket({}));
    check('без секрета вход из CRM выключен', notConfigured.location.includes('crm=config'), notConfigured.location);
  }

  // ---------- Напоминания и сводки ----------
  console.log('\nНапоминания');
  check('рассылку напоминаний запускает только HR', (await student.post('/api/admin/notifications', {})).status === 401);
  const later = new Date(Date.now() + 30 * 60_000).toISOString();
  const notifyRun = await admin.post('/api/admin/notifications', { at: later });
  check('проход напоминаний выполняется', notifyRun.status === 200 && typeof notifyRun.body?.messageDigests === 'number', notifyRun.body);
  check('студенту пришла сводка о непрочитанном сообщении', !!(await lastMail(email, 'Новое сообщение')));
  const notifyAgain = await admin.post('/api/admin/notifications', { at: later });
  check('повторный проход сводку не дублирует', notifyAgain.status === 200 && notifyAgain.body?.messageDigests === 0, notifyAgain.body);
  const notifyOff = await student.patch('/api/account/notifications', { email: false });
  check('напоминания отключаются', notifyOff.status === 200 && notifyOff.body?.email === false, notifyOff.body);
  check('настройка напоминаний сохраняется', (await student.request('/api/account/notifications')).body?.email === false);
  await student.patch('/api/account/notifications', { email: true });

  // ---------- Восстановление пароля ----------
  console.log('\nВосстановление пароля');
  check('страница «забыли пароль» открывается', (await new Session().request('/forgot')).status === 200);
  const forgotUnknown = await new Session().post('/api/auth/password/forgot', { email: `nobody-${Date.now()}@demo.ru` });
  check('на незнакомую почту ответ тот же, что на свою', forgotUnknown.status === 200 && forgotUnknown.body?.sent === true, forgotUnknown.body);
  const forgot = await new Session().post('/api/auth/password/forgot', { email });
  check('запрос ссылки сброса принят', forgot.status === 200 && forgot.body?.sent === true, forgot.body);
  const resetMail = await lastMail(email, 'Восстановление пароля');
  const resetToken = resetMail?.text.match(/\/reset\/([A-Za-z0-9_-]{20,})/)?.[1];
  check('письмо со ссылкой сброса пришло', !!resetToken, resetMail?.subject);
  const badReset = await new Session().post('/api/auth/password/reset', { token: 'x'.repeat(43), password: 'Newpass12345!' });
  check('чужая ссылка сброса не работает', badReset.status === 400, badReset.body);
  if (resetToken) {
    check('страница по ссылке открывается', (await new Session().request(`/reset/${resetToken}`)).status === 200);
    const weakReset = await new Session().post('/api/auth/password/reset', { token: resetToken, password: '123' });
    check('слабый пароль по ссылке не принимается', weakReset.status === 400 && !!weakReset.body?.fields?.password, weakReset.body);
    const reset = await new Session().post('/api/auth/password/reset', { token: resetToken, password: 'Newpass12345!' });
    check('пароль меняется по ссылке', reset.status === 200 && reset.body?.redirectTo === '/login?reset=1', reset.body);
    check(
      'ссылка сброса одноразовая',
      (await new Session().post('/api/auth/password/reset', { token: resetToken, password: 'Other12345!' })).status === 400,
    );
    check('старый пароль больше не подходит', (await new Session().post('/api/auth/login', { email, password: 'Smoke12345!' })).status === 401);
    check('новый пароль подходит', (await new Session().post('/api/auth/login', { email, password: 'Newpass12345!' })).status === 200);
  }

  // ---------- Перебор пароля ----------
  // Порог висит на учётной записи, а не только на адресе: за одним IP
  // сидит целый кампус, и рубить их всех из-за одного подборщика нельзя.
  console.log('\nПеребор пароля');
  const victim = `bruteforce-${Date.now()}@demo.ru`;
  const attempts: number[] = [];
  for (let i = 0; i < 9; i++) {
    attempts.push((await new Session().post('/api/auth/login', { email: victim, password: `нет-${i}` })).status);
  }
  check('перебор одной учётной записи упирается в лимит', attempts.includes(429), attempts.join(','));
  const neighbour = await new Session().post('/api/auth/login', {
    email: 'student@demo.ru',
    password: 'Demo12345!',
  });
  check('сосед по тому же адресу войти может', neighbour.status === 200, neighbour.status);

  // ---------- Итог ----------
  console.log(`\n${passed} проверок пройдено, ${failures.length} провалено`);
  if (failures.length) {
    console.log('Провалено:');
    for (const name of failures) console.log(`  · ${name}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('\nПроверка не завершилась:', error);
  process.exitCode = 1;
});
