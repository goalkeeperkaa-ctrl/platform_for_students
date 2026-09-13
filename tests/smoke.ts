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

const BASE = process.env.SMOKE_URL ?? 'http://localhost:3007';

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

  const registered = await student.post('/api/auth/register', {
    fullName: 'Тест Тестов',
    gender: 'MALE',
    birthYear: 2005,
    photoUrl: null,
    university: 'МГУ',
    speciality: 'Экономика',
    studyYear: 3,
    city: 'Москва',
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
  });
  check('регистрация', registered.status === 201, registered.body);

  const weakPassword = await new Session().post('/api/auth/register', {
    fullName: 'Тест Тестов',
    gender: 'MALE',
    birthYear: 2005,
    photoUrl: null,
    university: 'МГУ',
    speciality: 'Экономика',
    studyYear: 3,
    city: null,
    workDays: ['MON'],
    hoursPerWeek: 20,
    skills: [],
    about: null,
    resumeUrl: null,
    resumeName: null,
    email: `weak-${Date.now()}@demo.ru`,
    password: 'короткий',
    phone: '',
    consent: true,
  });
  check('слабый пароль отвергнут', weakPassword.status === 400, weakPassword.body);

  const noConsent = await new Session().post('/api/auth/register', {
    fullName: 'Тест Тестов',
    gender: 'MALE',
    birthYear: 2005,
    photoUrl: null,
    university: 'МГУ',
    speciality: 'Экономика',
    studyYear: 3,
    city: null,
    workDays: ['MON'],
    hoursPerWeek: 20,
    skills: [],
    about: null,
    resumeUrl: null,
    resumeName: null,
    email: `noconsent-${Date.now()}@demo.ru`,
    password: 'Smoke12345!',
    phone: '',
    consent: false,
  });
  check('регистрация без согласия на ПДн отвергнута', noConsent.status === 400, noConsent.body);

  // Регистрация сама выдаёт сессию, поэтому «зарегистрировался» ещё не
  // значит «сможет войти». Ровно этот путь — выйти и войти снова — не
  // проверялся вовсе, и сломайся хеширование пароля на одной из сторон,
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
    birthYear: 2005,
    photoUrl: null,
    university: 'МГУ',
    speciality: 'Экономика',
    studyYear: 3,
    city: 'Москва',
    workDays: ['MON'],
    hoursPerWeek: 20,
    skills: [],
    about: null,
    resumeUrl: null,
    resumeName: null,
    email,
    password: 'Smoke12345!',
    phone: '',
    consent: true,
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
  check('свайп вправо создаёт отклик', swipeRight.status === 200 && swipeRight.body.applied === true, swipeRight.body);

  const applications = await student.request('/api/applications');
  check(
    'отклик виден студенту',
    applications.body.applications?.some((a: any) => a.vacancy.id === liked.id),
  );

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
    birthYear: 2004,
    photoUrl: null,
    university: 'МГУ',
    speciality: 'Экономика',
    studyYear: 2,
    city: 'Москва',
    workDays: ['MON', 'TUE'],
    hoursPerWeek: 16,
    skills: ['Excel'],
    about: null,
    resumeUrl: null,
    resumeName: null,
    phone: '+7 900 555-44-33',
  };
  const ownerCreated = await owner.post('/api/auth/register', {
    ...ownerProfile,
    email: ownerEmail,
    password: 'Smoke12345!',
    consent: true,
  });
  check('студент для проверки профиля заведён', ownerCreated.status === 201, ownerCreated.body);

  const minor = await new Session().post('/api/auth/register', {
    ...ownerProfile,
    birthYear: new Date().getFullYear() - 17,
    email: `smoke-minor-${Date.now()}@demo.ru`,
    password: 'Smoke12345!',
    consent: true,
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

  const erased = await owner.delete('/api/students/me', {});
  check('профиль удаляется', erased.status === 200, erased.body);
  check('после удаления сессии нет', (await owner.request('/api/auth/me')).body.session === null);
  const afterErase = await new Session().post('/api/auth/login', {
    email: ownerEmail,
    password: 'Smoke12345!',
  });
  check('войти в удалённый профиль нельзя', afterErase.status === 401, afterErase.status);
  const reRegister = await new Session().post('/api/auth/register', {
    ...ownerProfile,
    email: ownerEmail,
    password: 'Smoke12345!',
    consent: true,
  });
  // Почта освобождается вместе с данными: иначе удалённый человек не
  // смог бы вернуться, а его адрес так и остался бы лежать в базе
  check('после удаления почту можно занять снова', reRegister.status === 201, reRegister.body);
  if (reRegister.status === 201) {
    const again = new Session();
    await again.post('/api/auth/login', { email: ownerEmail, password: 'Smoke12345!' });
    await again.delete('/api/students/me', {});
  }

  // ---------- Компания ----------
  // Самостоятельная регистрация: кабинет открывается сразу, а публичной
  // страница становится только после одобрения агентством.
  console.log('\nКомпания');
  const companyEmail = `smoke-company-${Date.now()}@demo.ru`;
  const companyData = {
    companyName: 'Проверочная Компания',
    contactName: 'Иван Проверкин',
    email: companyEmail,
    password: 'Smoke12345!',
    industry: 'IT',
    city: 'Казань',
    consent: true,
  };
  const company = new Session();
  const companyReg = await company.post('/api/auth/register/company', companyData);
  check('компания регистрируется сама', companyReg.status === 201, companyReg.body);
  check('новая компания на модерации', companyReg.body?.moderationStatus === 'PENDING', companyReg.body);

  const companyNoConsent = await new Session().post('/api/auth/register/company', {
    ...companyData,
    email: `smoke-company-${Date.now() + 1}@demo.ru`,
    consent: false,
  });
  check('без согласия компанию не регистрируют', companyNoConsent.status === 400, companyNoConsent.status);
  const companyDup = await new Session().post('/api/auth/register/company', companyData);
  check('почту компании нельзя занять повторно', companyDup.status === 409, companyDup.status);

  const companyLogin = await new Session().post('/api/auth/login', { email: companyEmail, password: 'Smoke12345!' });
  check('компания входит по почте и паролю', companyLogin.status === 200 && companyLogin.body?.role === 'EMPLOYER', companyLogin.body);
  check('кабинет компании открывается', (await company.request('/employer/company')).status === 200);

  const companyId = (await company.request('/api/auth/me')).body.session?.profileId as string;
  const companyPage = {
    companyName: 'Проверочная Компания',
    contactName: 'Иван Проверкин',
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

  const submitted = await company.post(`/api/employer/vacancies/${vacancyId}`, { action: 'submit' });
  check('вакансия уходит на проверку', submitted.status === 200 && submitted.body?.status === 'PENDING', submitted.body);

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

  const companyApproved = await admin.post('/api/admin/moderation', { entity: 'company', id: companyId, decision: 'APPROVE' });
  check('компания одобряется', companyApproved.status === 200 && companyApproved.body?.status === 'APPROVED', companyApproved.body);
  check('одобренная компания открыта гостю', (await new Session().request(`/companies/${companyId}`)).status === 200);
  const vacancyApproved = await admin.post('/api/admin/moderation', { entity: 'vacancy', id: vacancyId, decision: 'APPROVE' });
  check('вакансия одобряется', vacancyApproved.status === 200 && vacancyApproved.body?.status === 'PUBLISHED', vacancyApproved.body);
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
  const publicCompany = await new Session().request(`/companies/${companyId}`);
  check('вакансия видна на странице компании', String(publicCompany.body).includes('Стажёр-аналитик'), publicCompany.status);

  const edited = await company.patch(`/api/employer/vacancies/${vacancyId}`, { ...vacancyForm, title: 'Стажёр-аналитик данных' });
  check('правка опубликованной вакансии отправляет её на проверку', edited.status === 200 && edited.body?.status === 'PENDING', edited.body);
  check('после правки вакансии нет в ленте', !(await inFeed()));
  await admin.post('/api/admin/moderation', { entity: 'vacancy', id: vacancyId, decision: 'APPROVE' });
  check('после повторного одобрения вакансия снова в ленте', await inFeed());

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
