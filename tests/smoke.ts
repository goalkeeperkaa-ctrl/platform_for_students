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
