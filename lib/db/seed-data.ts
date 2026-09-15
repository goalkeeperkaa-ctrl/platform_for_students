import type { AchievementItem, ActivityItem, LinkItem, LookingFor, ProjectItem } from '@/lib/types';
import type { CrmVacancyInput } from './types';

/**
 * Демонстрационный срез CRM.
 *
 * Один и тот же массив питает и `prisma db seed`, и хранилище в памяти:
 * иначе демо-режим и настоящая база расходились бы, и баг находился бы
 * только на проде.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

export const CRM_VACANCIES: CrmVacancyInput[] = [
  {
    crmId: 'CRM-1001',
    companyName: 'Кофейни «Север»',
    contactName: 'Анна Верещагина',
    contactEmail: 'hr@sever-coffee.ru',
    crmClientId: 'client-sever',
    title: 'Бариста',
    summary:
      'Небольшая сеть спешелти-кофеен ищет бариста на утренние и вечерние смены. Обучение на месте — опыт не нужен, нужен интерес к кофе.',
    responsibilities: [
      'Готовить эспрессо и напитки на его основе',
      'Работать на кассе и общаться с гостями',
      'Держать бар в чистоте по чек-листу смены',
    ],
    requirements: [
      'Возраст от 18 лет, медкнижка (поможем оформить)',
      'Готовность работать 3–4 смены в неделю',
      'Внимательность и спокойствие в час пик',
    ],
    perks: ['Бесплатный кофе и обеды', 'Оплата раз в две недели', 'Смены под расписание учёбы'],
    salaryFrom: 3200,
    salaryTo: 4200,
    salaryPeriod: 'SHIFT',
    city: 'Казань',
    district: 'Вахитовский',
    address: 'ул. Баумана, 44',
    addressDetails: null,
    workFormat: 'ONSITE',
    employmentType: 'SHIFT',
    shiftDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
    hoursPerWeek: 24,
    tags: ['Без опыта', 'Гибкий график', 'Питание'],
    isHot: true,
    isActive: true,
    publishedAt: daysAgo(1),
  },
  {
    crmId: 'CRM-1002',
    companyName: 'Кофейни «Север»',
    contactName: 'Анна Верещагина',
    contactEmail: 'hr@sever-coffee.ru',
    crmClientId: 'client-sever',
    title: 'Помощник управляющего кофейни',
    summary:
      'Позиция для студента старших курсов, который хочет расти в операционный менеджмент: инвентаризация, графики, приёмка.',
    responsibilities: [
      'Составлять графики смен и вести табель',
      'Принимать поставки и вести остатки',
      'Помогать управляющему с отчётностью',
    ],
    requirements: [
      '3–4 курс, экономика/менеджмент или смежное',
      'Уверенный Excel / Google Таблицы',
      'От 20 часов в неделю',
    ],
    perks: ['Наставник из управляющей команды', 'Рост до управляющего за год', 'Оплата проезда'],
    salaryFrom: 62000,
    salaryTo: 78000,
    salaryPeriod: 'MONTH',
    city: 'Казань',
    district: 'Вахитовский',
    address: 'ул. Пушкина, 12',
    addressDetails: null,
    workFormat: 'ONSITE',
    employmentType: 'PART_TIME',
    shiftDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    hoursPerWeek: 25,
    tags: ['Карьерный рост', 'Excel', 'Менеджмент'],
    isHot: false,
    isActive: true,
    publishedAt: daysAgo(4),
  },
  {
    crmId: 'CRM-1003',
    companyName: 'Metrika Digital',
    contactName: 'Кирилл Осипов',
    contactEmail: 'people@metrika.digital',
    crmClientId: 'client-metrika',
    title: 'Ассистент таргетолога',
    summary:
      'Диджитал-агентство берёт стажёра в перформанс-отдел. Реальные бюджеты, свой пул клиентов через три месяца.',
    responsibilities: [
      'Собирать креативы и запускать тестовые кампании',
      'Вести отчётность по площадкам',
      'Анализировать связки и предлагать гипотезы',
    ],
    requirements: [
      'Понимание, как устроена реклама в соцсетях',
      'Аккуратность в цифрах',
      'От 20 часов в неделю, можно удалённо',
    ],
    perks: ['Гибрид 2/3', 'Курс по перформансу за счёт компании', 'Оффер после стажировки'],
    salaryFrom: 55000,
    salaryTo: 70000,
    salaryPeriod: 'MONTH',
    city: 'Казань',
    district: 'Площадь Тукая',
    address: 'ул. Пушкина, 5',
    addressDetails: 'офис 301',
    workFormat: 'HYBRID',
    employmentType: 'INTERNSHIP',
    shiftDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    hoursPerWeek: 24,
    tags: ['Маркетинг', 'Аналитика', 'Стажировка'],
    isHot: true,
    isActive: true,
    publishedAt: daysAgo(2),
  },
  {
    crmId: 'CRM-1004',
    companyName: 'Metrika Digital',
    contactName: 'Кирилл Осипов',
    contactEmail: 'people@metrika.digital',
    crmClientId: 'client-metrika',
    title: 'Контент-менеджер соцсетей',
    summary:
      'Нужен человек, который ведёт аккаунты клиентов: пишет тексты, собирает рилсы, следит за реакцией аудитории.',
    responsibilities: [
      'Готовить контент-план на неделю',
      'Монтировать вертикальные видео',
      'Отвечать в комментариях и директе',
    ],
    requirements: [
      'Грамотный русский язык',
      'CapCut или Premiere на базовом уровне',
      'Портфолио — хотя бы личный проект',
    ],
    perks: ['Полностью удалённо', 'Свободный график сдачи', 'Оплата по факту закрытия месяца'],
    salaryFrom: 48000,
    salaryTo: 60000,
    salaryPeriod: 'MONTH',
    city: 'Казань',
    district: null,
    address: null,
    addressDetails: null,
    workFormat: 'REMOTE',
    employmentType: 'PART_TIME',
    shiftDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    hoursPerWeek: 20,
    tags: ['Удалённо', 'SMM', 'Видео'],
    isHot: false,
    isActive: true,
    publishedAt: daysAgo(6),
  },
  {
    crmId: 'CRM-1005',
    companyName: 'Grand Plaza Hotel',
    contactName: 'Марина Долгих',
    contactEmail: 'career@grandplaza.ru',
    crmClientId: 'client-grandplaza',
    title: 'Администратор стойки размещения',
    summary:
      'Отель 4* ищет студентов на стойку. График сутки через трое — удобно совмещать с очным обучением.',
    responsibilities: [
      'Заселять и выселять гостей',
      'Вести бронирования в PMS',
      'Решать вопросы гостей на английском и русском',
    ],
    requirements: [
      'Английский от B1',
      'Опрятность и доброжелательность',
      'Готовность к ночным сменам',
    ],
    perks: ['Сутки через трое', 'Форма и питание', 'Скидки в отелях сети'],
    salaryFrom: 72000,
    salaryTo: 88000,
    salaryPeriod: 'MONTH',
    city: 'Казань',
    district: 'Кремлёвская',
    address: 'ул. Кремлёвская, 21',
    addressDetails: null,
    workFormat: 'ONSITE',
    employmentType: 'SHIFT',
    shiftDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
    hoursPerWeek: 40,
    tags: ['Английский', 'Сутки/трое', 'Гостиничный бизнес'],
    isHot: false,
    isActive: true,
    publishedAt: daysAgo(3),
  },
  {
    crmId: 'CRM-1006',
    companyName: 'Grand Plaza Hotel',
    contactName: 'Марина Долгих',
    contactEmail: 'career@grandplaza.ru',
    crmClientId: 'client-grandplaza',
    title: 'Официант банкетной службы',
    summary:
      'Разовые и регулярные смены на банкетах и конференциях. Можно брать только выходные.',
    responsibilities: [
      'Сервировать залы под мероприятие',
      'Обслуживать гостей на банкете',
      'Убирать зал после мероприятия',
    ],
    requirements: ['Медкнижка', 'Опыт необязателен', 'Выносливость: смены по 8–10 часов'],
    perks: ['Оплата в день смены', 'Форма выдаётся', 'Чаевые остаются вам'],
    salaryFrom: 3500,
    salaryTo: 5200,
    salaryPeriod: 'SHIFT',
    city: 'Казань',
    district: 'Кремлёвская',
    address: 'ул. Профсоюзная, 17',
    addressDetails: null,
    workFormat: 'ONSITE',
    employmentType: 'SHIFT',
    shiftDays: ['FRI', 'SAT', 'SUN'],
    hoursPerWeek: 16,
    tags: ['Выходные', 'Оплата в день смены', 'Без опыта'],
    isHot: true,
    isActive: true,
    publishedAt: daysAgo(1),
  },
  {
    crmId: 'CRM-1007',
    companyName: 'Даркстор «Ближний»',
    contactName: 'Игорь Пахомов',
    contactEmail: 'hr@blizhniy.store',
    crmClientId: 'client-blizhniy',
    title: 'Сборщик заказов',
    summary:
      'Сборка онлайн-заказов на складе у дома. Смены от 4 часов, выбираете сами в приложении.',
    responsibilities: [
      'Собирать заказы по маршрутному листу',
      'Проверять сроки годности',
      'Выкладывать товар на полки',
    ],
    requirements: ['От 18 лет', 'Медкнижка', 'Готовность к работе на ногах'],
    perks: ['Смены от 4 часов', 'Выплаты еженедельно', 'Склад в 10 минутах от метро'],
    salaryFrom: 380,
    salaryTo: 450,
    salaryPeriod: 'HOUR',
    city: 'Казань',
    district: 'Козья слобода',
    address: 'ул. Декабристов, 85',
    addressDetails: null,
    workFormat: 'ONSITE',
    employmentType: 'SHIFT',
    shiftDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
    hoursPerWeek: 20,
    tags: ['Почасовая оплата', 'Смены от 4 часов', 'Без опыта'],
    isHot: false,
    isActive: true,
    publishedAt: daysAgo(8),
  },
  {
    crmId: 'CRM-1008',
    companyName: 'Технопарк «Вектор»',
    contactName: 'Лидия Ким',
    contactEmail: 'jobs@vector-tech.ru',
    crmClientId: 'client-vector',
    title: 'Junior QA-инженер',
    summary:
      'Тестирование внутренних сервисов технопарка. Берём студентов ИТ-специальностей без коммерческого опыта.',
    responsibilities: [
      'Проходить тест-кейсы по веб-интерфейсам',
      'Заводить баги в трекер с воспроизведением',
      'Помогать в регрессе перед релизом',
    ],
    requirements: [
      'Понимание клиент-серверной архитектуры',
      'Базовый SQL',
      'Английский для чтения документации',
    ],
    perks: ['Гибрид, 2 дня в офисе', 'Ментор из команды', 'Оплачиваемая переработка'],
    salaryFrom: 60000,
    salaryTo: 80000,
    salaryPeriod: 'MONTH',
    city: 'Казань',
    district: 'Горки',
    address: 'пр. Победы, 91',
    addressDetails: 'офис 12',
    workFormat: 'HYBRID',
    employmentType: 'PART_TIME',
    shiftDays: ['MON', 'TUE', 'WED', 'THU'],
    hoursPerWeek: 24,
    tags: ['IT', 'SQL', 'Ментор'],
    isHot: true,
    isActive: true,
    publishedAt: daysAgo(2),
  },
  {
    crmId: 'CRM-1009',
    companyName: 'Технопарк «Вектор»',
    contactName: 'Лидия Ким',
    contactEmail: 'jobs@vector-tech.ru',
    crmClientId: 'client-vector',
    title: 'Специалист технической поддержки',
    summary:
      'Первая линия поддержки резидентов технопарка: доступы, оборудование, ПО. Ночных смен нет.',
    responsibilities: [
      'Принимать обращения в тикет-системе',
      'Настраивать рабочие места и доступы',
      'Вести базу знаний',
    ],
    requirements: ['Windows и macOS на уровне уверенного пользователя', 'Терпение', 'От 20 часов в неделю'],
    perks: ['График 2/2', 'Обеды в технопарке', 'Доступ к лабораториям'],
    salaryFrom: 52000,
    salaryTo: 65000,
    salaryPeriod: 'MONTH',
    city: 'Казань',
    district: 'Горки',
    address: 'ул. Рихарда Зорге, 66',
    addressDetails: null,
    workFormat: 'ONSITE',
    employmentType: 'SHIFT',
    shiftDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    hoursPerWeek: 22,
    tags: ['IT', 'Поддержка', 'График 2/2'],
    isHot: false,
    isActive: true,
    publishedAt: daysAgo(9),
  },
  {
    crmId: 'CRM-1010',
    companyName: 'Образовательный центр «Логос»',
    contactName: 'Пётр Савин',
    contactEmail: 'hr@logos-edu.ru',
    crmClientId: 'client-logos',
    title: 'Преподаватель математики (подготовка к ЕГЭ)',
    summary:
      'Ведём группы 10–11 классов. Ищем студентов сильных технических вузов, которые помнят, как сами сдавали.',
    responsibilities: [
      'Вести занятия по готовой программе',
      'Проверять домашние работы',
      'Давать обратную связь родителям раз в месяц',
    ],
    requirements: [
      'Профильный ЕГЭ по математике от 80 баллов',
      'Технический вуз, 2 курс и выше',
      'Два вечера в неделю',
    ],
    perks: ['Готовые материалы', 'Оплата за час выше рынка', 'Можно вести онлайн'],
    salaryFrom: 1400,
    salaryTo: 2000,
    salaryPeriod: 'HOUR',
    city: 'Казань',
    district: 'Проспект Победы',
    address: 'пр. Победы, 139',
    addressDetails: 'этаж 4',
    workFormat: 'HYBRID',
    employmentType: 'PART_TIME',
    shiftDays: ['TUE', 'THU', 'SAT'],
    hoursPerWeek: 10,
    tags: ['Преподавание', 'Вечера', 'Высокая ставка'],
    isHot: false,
    isActive: true,
    publishedAt: daysAgo(5),
  },
  {
    crmId: 'CRM-1011',
    companyName: 'Агентство «Формат»',
    contactName: 'Юлия Нестерова',
    contactEmail: 'staff@format-events.ru',
    crmClientId: 'client-format',
    title: 'Хостес на выставки и конференции',
    summary:
      'Работа на площадках Экспоцентра и Крокуса: встреча гостей, регистрация, навигация. Смены по календарю мероприятий.',
    responsibilities: [
      'Регистрировать участников на стойке',
      'Ориентировать гостей по площадке',
      'Помогать организаторам на площадке',
    ],
    requirements: ['Презентабельный вид', 'Чёткая речь', 'Английский приветствуется'],
    perks: ['Оплата в день мероприятия', 'Смены выбираете сами', 'Питание на площадке'],
    salaryFrom: 3800,
    salaryTo: 5500,
    salaryPeriod: 'SHIFT',
    city: 'Казань',
    district: 'Ново-Савиновский',
    address: 'пр. Ямашева, 46',
    addressDetails: null,
    workFormat: 'ONSITE',
    employmentType: 'PROJECT',
    shiftDays: ['WED', 'THU', 'FRI', 'SAT'],
    hoursPerWeek: 14,
    tags: ['Ивенты', 'Оплата в день смены', 'Английский'],
    isHot: true,
    isActive: true,
    publishedAt: daysAgo(1),
  },
  {
    crmId: 'CRM-1012',
    companyName: 'Агентство «Формат»',
    contactName: 'Юлия Нестерова',
    contactEmail: 'staff@format-events.ru',
    crmClientId: 'client-format',
    title: 'Промоутер-консультант',
    summary:
      'Дегустации и промо в торговых центрах. Разовые выходы или постоянный график — на ваш выбор.',
    responsibilities: [
      'Рассказывать о продукте посетителям',
      'Проводить дегустации по скрипту',
      'Заполнять отчёт по смене',
    ],
    requirements: ['От 18 лет', 'Медкнижка для продуктовых промо', 'Общительность'],
    perks: ['Выходы от 4 часов', 'Оплата через 3 дня', 'Обучение перед первой сменой'],
    salaryFrom: 400,
    salaryTo: 520,
    salaryPeriod: 'HOUR',
    city: 'Казань',
    district: null,
    address: 'ул. Сибирский тракт, 34',
    addressDetails: null,
    workFormat: 'ONSITE',
    employmentType: 'PROJECT',
    shiftDays: ['SAT', 'SUN'],
    hoursPerWeek: 12,
    tags: ['Выходные', 'Без опыта', 'Почасовая оплата'],
    isHot: false,
    isActive: true,
    publishedAt: daysAgo(11),
  },
  {
    crmId: 'CRM-1013',
    companyName: 'Лаборатория Гагарина',
    contactName: 'Дмитрий Ильин',
    contactEmail: 'lab@gagarin-research.ru',
    crmClientId: 'client-gagarin',
    title: 'Лаборант-исследователь',
    summary:
      'Исследовательская лаборатория берёт студентов химических и биологических факультетов на подготовку образцов.',
    responsibilities: [
      'Готовить растворы и образцы',
      'Вести лабораторный журнал',
      'Обслуживать приборы по регламенту',
    ],
    requirements: [
      'Химия или биология, 2 курс и выше',
      'Аккуратность в протоколах',
      'От 16 часов в неделю',
    ],
    perks: ['Публикации в соавторстве', 'Тема для диплома', 'Свободный вход в лабораторию'],
    salaryFrom: 45000,
    salaryTo: 58000,
    salaryPeriod: 'MONTH',
    city: 'Казань',
    district: 'Суконная слобода',
    address: 'ул. Спартаковская, 6',
    addressDetails: null,
    workFormat: 'ONSITE',
    employmentType: 'PART_TIME',
    shiftDays: ['MON', 'WED', 'FRI'],
    hoursPerWeek: 18,
    tags: ['Наука', 'Диплом', 'Лаборатория'],
    isHot: false,
    isActive: true,
    publishedAt: daysAgo(7),
  },
  {
    crmId: 'CRM-1014',
    companyName: 'Технопарк «Вектор»',
    contactName: 'Лидия Ким',
    contactEmail: 'jobs@vector-tech.ru',
    crmClientId: 'client-vector',
    title: 'Аналитик данных (стажёр)',
    summary:
      'Стажировка в продуктовой аналитике: дашборды, когорты, A/B. Нужен человек, которому нравится копаться в цифрах.',
    responsibilities: [
      'Собирать выгрузки по SQL',
      'Поддерживать дашборды команды',
      'Считать метрики экспериментов',
    ],
    requirements: ['SQL уверенно', 'Python на уровне pandas', 'Статистика в объёме курса вуза'],
    perks: ['Удалённо или гибрид', 'Наставник-аналитик', 'Проект в портфолио'],
    salaryFrom: 58000,
    salaryTo: 75000,
    salaryPeriod: 'MONTH',
    city: 'Казань',
    district: null,
    address: null,
    addressDetails: null,
    workFormat: 'REMOTE',
    employmentType: 'INTERNSHIP',
    shiftDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    hoursPerWeek: 20,
    tags: ['Аналитика', 'SQL', 'Python'],
    isHot: true,
    isActive: true,
    publishedAt: daysAgo(3),
  },
];

/** Учётные записи для демонстрации всех трёх ролей. */
export const DEMO_CREDENTIALS = {
  student: { email: 'student@demo.ru', password: 'Demo12345!' },
  admin: { email: 'admin@fattakhov.ru', password: 'Admin12345!' },
  /** Работодатель входит по коду из CRM, а не по паролю */
  employerCode: 'SEVR-2026-DEMO',
  employerCrmClientId: 'client-sever',
} as const;

export const DEMO_STUDENT_PROFILE = {
  fullName: 'Алиса Ковалёва',
  phone: '+7 916 240-11-08',
  gender: 'FEMALE' as const,
  birthYear: 2005,
  birthDate: '2005-04-12',
  university: 'КФУ',
  speciality: 'Реклама и связи с общественностью',
  studyYear: 3,
  city: 'Казань',
  workDays: ['MON', 'WED', 'FRI', 'SAT'] as const,
  hoursPerWeek: 22,
  skills: ['Excel', 'SMM', 'Английский B2', 'Копирайтинг', 'Figma'],
  about: 'Ищу подработку в маркетинге или сфере услуг. Свободна во второй половине дня.',

  // Портфолио демо-студента заполнено не целиком намеренно: так на демо
  // видно и то, как выглядит заполненный блок, и подсказку «чего не хватает»
  lookingFor: ['JOB', 'INTERNSHIP'] as LookingFor[],
  goals: 'Вырасти в маркетолога в продуктовой компании. Интересны контент и исследования аудитории.',
  projects: [
    {
      title: 'Соцсети студенческого медиа факультета',
      description: 'Контент-план и публикации на протяжении года, аудитория выросла с 1,2 до 4 тысяч.',
      link: null,
    },
  ] as ProjectItem[],
  achievements: [
    { title: 'Финалист кейс-чемпионата по маркетингу', description: null, year: 2025 },
  ] as AchievementItem[],
  activities: [
    {
      kind: 'COMMUNITY',
      title: 'Организатор мероприятий факультета',
      description: 'Три фестиваля и дни открытых дверей.',
    },
    { kind: 'SPORT', title: 'Волейбол, шесть лет', description: null },
  ] as ActivityItem[],
  hobbies: 'Фотография, настольные игры',
  links: [] as LinkItem[],
  videoUrl: null as string | null,
};

export { STUDENT_CONSENT_VERSION as CONSENT_VERSION } from '@/lib/legal';

/**
 * Страница компании у демо-клиента. Без неё публичная страница на демо
 * была бы пустой, и по ней нельзя было бы понять, как её видит студент.
 */
export const DEMO_COMPANY_PROFILES: Record<
  string,
  { industry: string; about: string; culture: string; city: string }
> = {
  'client-sever': {
    industry: 'Кофейни и общепит',
    about: 'Небольшая сеть спешелти-кофеен в центре Казани. Обучаем бариста с нуля и растим управляющих из своих сотрудников.',
    culture: 'Смены под учёбу, наставник на первые недели, прозрачный рост от бариста до управляющего.',
    city: 'Казань',
  },
};

/**
 * Карточка вакансии v0.1 у демо-вакансий: чему научится студент и с кем
 * будет работать. В выгрузке CRM этих полей нет — их заполняет агентство
 * или сама компания, поэтому они лежат отдельно от выгрузки.
 */
export const DEMO_VACANCY_EXTRAS: Record<string, { learnings: string[]; team: string }> = {
  'CRM-1001': {
    learnings: [
      'Готовить эспрессо-напитки по стандартам спешелти',
      'Работать с кассой и закрывать смену',
      'Общаться с гостями так, чтобы они возвращались',
    ],
    team: 'Смена из трёх бариста и старший смены. Первые две недели рядом наставник — он же принимает аттестацию.',
  },
  'CRM-1002': {
    learnings: [
      'Планировать смены и закупки',
      'Разбирать выручку и себестоимость',
      'Проводить собеседования и вводить новичков в работу',
    ],
    team: 'Управляющий кофейни — ваш наставник. В команде шесть бариста, с которыми вы работаете каждый день.',
  },
};

/**
 * Справочник вузов для старта пилота.
 *
 * Не демо-данные: на бою его загружает `npm run institutions:load`, а не
 * `db:seed`. Лежит здесь, потому что демо-студенты связаны с ним по
 * короткому названию — оно совпадает с тем, как вуз записан у них.
 * Описания нейтральные — страница учреждения не реклама и не рейтинг.
 */
export const INSTITUTIONS: Array<{
  slug: string;
  name: string;
  shortName: string | null;
  city: string;
  description: string;
  directions: string[];
  website: string | null;
}> = [
  {
    slug: 'kpfu',
    name: 'Казанский (Приволжский) федеральный университет',
    shortName: 'КФУ',
    city: 'Казань',
    description: 'Федеральный университет: естественные и точные науки, IT, медицина, экономика, право и гуманитарные направления.',
    directions: ['Информационные технологии', 'Медицина', 'Экономика', 'Юриспруденция', 'Филология', 'Педагогика'],
    website: 'https://kpfu.ru',
  },
  {
    slug: 'kai',
    name: 'Казанский национальный исследовательский технический университет им. А. Н. Туполева — КАИ',
    shortName: 'КАИ',
    city: 'Казань',
    description: 'Технический университет: авиастроение, радиотехника, информатика и автоматизация.',
    directions: ['Авиа- и ракетостроение', 'Радиотехника', 'Информатика и вычислительная техника', 'Автоматизация', 'Экономика и управление'],
    website: 'https://kai.ru',
  },
  {
    slug: 'knitu',
    name: 'Казанский национальный исследовательский технологический университет',
    shortName: 'КНИТУ',
    city: 'Казань',
    description: 'Технологический университет: химическая технология, нефтехимия, материалы, дизайн и управление.',
    directions: ['Химическая технология', 'Нефтегазовое дело', 'Материаловедение', 'Биотехнология', 'Дизайн', 'Менеджмент'],
    website: 'https://www.kstu.ru',
  },
  {
    slug: 'kgasu',
    name: 'Казанский государственный архитектурно-строительный университет',
    shortName: 'КГАСУ',
    city: 'Казань',
    description: 'Архитектура, строительство, дорожное хозяйство и управление недвижимостью.',
    directions: ['Архитектура', 'Строительство', 'Дизайн архитектурной среды', 'Землеустройство'],
    website: 'https://www.kgasu.ru',
  },
  {
    slug: 'kgeu',
    name: 'Казанский государственный энергетический университет',
    shortName: 'КГЭУ',
    city: 'Казань',
    description: 'Энергетика, электроэнергетика, теплоэнергетика, IT и экономика энергетики.',
    directions: ['Электроэнергетика', 'Теплоэнергетика', 'Информационные системы', 'Экономика'],
    website: 'https://kgeu.ru',
  },
  {
    slug: 'kgmu',
    name: 'Казанский государственный медицинский университет',
    shortName: 'КГМУ',
    city: 'Казань',
    description: 'Медицинский университет: лечебное дело, педиатрия, стоматология, фармация.',
    directions: ['Лечебное дело', 'Педиатрия', 'Стоматология', 'Фармация', 'Медико-профилактическое дело'],
    website: 'https://kazangmu.ru',
  },
  {
    slug: 'kgma',
    name: 'Казанская государственная медицинская академия — филиал РМАНПО',
    shortName: 'КГМА',
    city: 'Казань',
    description: 'Последипломное медицинское образование: ординатура и повышение квалификации врачей.',
    directions: ['Ординатура', 'Повышение квалификации'],
    website: null,
  },
  {
    slug: 'kazgau',
    name: 'Казанский государственный аграрный университет',
    shortName: 'Казанский ГАУ',
    city: 'Казань',
    description: 'Агрономия, агроинженерия, землеустройство, экономика и управление в АПК.',
    directions: ['Агрономия', 'Агроинженерия', 'Землеустройство', 'Экономика'],
    website: 'https://kazgau.ru',
  },
  {
    slug: 'kgavm',
    name: 'Казанская государственная академия ветеринарной медицины им. Н. Э. Баумана',
    shortName: 'КГАВМ',
    city: 'Казань',
    description: 'Ветеринария, зоотехния и ветеринарно-санитарная экспертиза.',
    directions: ['Ветеринария', 'Зоотехния', 'Ветеринарно-санитарная экспертиза'],
    website: null,
  },
  {
    slug: 'kazgik',
    name: 'Казанский государственный институт культуры',
    shortName: 'КазГИК',
    city: 'Казань',
    description: 'Культура и искусство: режиссура, музыка, хореография, социокультурная деятельность.',
    directions: ['Режиссура', 'Музыкальное искусство', 'Хореография', 'Социокультурная деятельность'],
    website: null,
  },
  {
    slug: 'kazan-conservatory',
    name: 'Казанская государственная консерватория им. Н. Г. Жиганова',
    shortName: 'Казанская консерватория',
    city: 'Казань',
    description: 'Музыкальное образование: исполнительство, композиция, музыковедение.',
    directions: ['Исполнительство', 'Композиция', 'Музыковедение'],
    website: null,
  },
  {
    slug: 'pgufksit',
    name: 'Поволжский государственный университет физической культуры, спорта и туризма',
    shortName: 'ПГУФКСиТ',
    city: 'Казань',
    description: 'Физическая культура, спорт, туризм и спортивный менеджмент.',
    directions: ['Физическая культура', 'Спорт', 'Туризм', 'Спортивный менеджмент'],
    website: null,
  },
  {
    slug: 'kiu',
    name: 'Казанский инновационный университет им. В. Г. Тимирясова',
    shortName: 'КИУ',
    city: 'Казань',
    description: 'Экономика, право, менеджмент, психология и IT.',
    directions: ['Экономика', 'Юриспруденция', 'Менеджмент', 'Психология', 'Информационные технологии'],
    website: 'https://ieml.ru',
  },
  {
    slug: 'tisbi',
    name: 'Университет управления «ТИСБИ»',
    shortName: 'ТИСБИ',
    city: 'Казань',
    description: 'Экономика, менеджмент, право, прикладная информатика и дизайн.',
    directions: ['Экономика', 'Менеджмент', 'Юриспруденция', 'Прикладная информатика', 'Дизайн'],
    website: 'https://www.tisbi.ru',
  },
  {
    slug: 'rii',
    name: 'Российский исламский институт',
    shortName: 'РИИ',
    city: 'Казань',
    description: 'Теология, лингвистика и история.',
    directions: ['Теология', 'Лингвистика', 'История'],
    website: null,
  },
  {
    slug: 'kki-ruk',
    name: 'Казанский кооперативный институт (филиал) Российского университета кооперации',
    shortName: 'ККИ РУК',
    city: 'Казань',
    description: 'Торговое дело, экономика, товароведение и юриспруденция.',
    directions: ['Торговое дело', 'Экономика', 'Товароведение', 'Юриспруденция'],
    website: null,
  },
  {
    slug: 'kf-rgup',
    name: 'Казанский филиал Российского государственного университета правосудия',
    shortName: 'КФ РГУП',
    city: 'Казань',
    description: 'Юриспруденция: судебная и правоохранительная деятельность.',
    directions: ['Юриспруденция'],
    website: null,
  },
  {
    slug: 'ki-vguyu',
    name: 'Казанский институт (филиал) Всероссийского государственного университета юстиции',
    shortName: 'КИ ВГУЮ',
    city: 'Казань',
    description: 'Юриспруденция.',
    directions: ['Юриспруденция'],
    website: null,
  },
];

export const DEMO_INSTITUTIONS = INSTITUTIONS;

/**
 * Остальные студенты, отклики и переписка.
 *
 * Лежат здесь, а не внутри хранилища в памяти, по той же причине, что и
 * вакансии выше: пока эти фикстуры знало только демо-хранилище, база
 * после `db:seed` получала работодателей и вакансии, но ни одного
 * отклика. На демо-режиме разделы «Отклики», «Пропущенные» и
 * «Сообщения» были живыми, а на настоящей базе — пустыми, и разница
 * обнаруживалась только после переключения на PostgreSQL.
 */
export const DEMO_EXTRA_STUDENTS = [
  {
    fullName: 'Марк Гурьев',
    university: 'КАИ',
    speciality: 'Информатика и вычислительная техника',
    status: 'ACTIVE' as const,
    birthYear: 2004,
    birthDate: '2004-11-03',
    skills: ['Python', 'SQL', 'Английский B2'],
  },
  {
    fullName: 'Дарья Пшеничная',
    university: 'КИУ',
    speciality: 'Маркетинг',
    status: 'IN_PROGRESS' as const,
    birthYear: 2005,
    birthDate: '2005-06-21',
    skills: ['SMM', 'Excel', 'Копирайтинг'],
  },
  {
    fullName: 'Тимур Насыров',
    university: 'КФУ',
    speciality: 'Прикладная математика',
    status: 'PLACED' as const,
    birthYear: 2003,
    birthDate: '2003-02-17',
    skills: ['SQL', 'Python', 'Статистика'],
  },
  {
    fullName: 'Ева Логинова',
    university: 'КФУ',
    speciality: 'Журналистика',
    status: 'ACTIVE' as const,
    birthYear: 2006,
    birthDate: '2006-01-09',
    skills: ['Копирайтинг', 'Английский B2', 'Видео'],
  },
  {
    fullName: 'Артём Соболев',
    university: 'КНИТУ',
    speciality: 'Материаловедение',
    status: 'PAUSED' as const,
    birthYear: 2004,
    birthDate: '2004-08-30',
    skills: ['Excel', 'Химия', 'Лаборатория'],
  },
];

/** Почта и телефон i-го дополнительного студента — одинаково в обоих хранилищах. */
export const extraStudentEmail = (i: number) => `student${i + 2}@demo.ru`;
export const extraStudentPhone = (i: number) => `+7 9${10 + i}5 ${100 + i}-22-3${i}`;

/**
 * Статусы откликов по кругу: воронка работодателя и статистика админа
 * должны показывать разные этапы, а не колонку одинаковых «новых».
 */
export const DEMO_APPLICATION_FUNNEL = [
  'INVITED',
  'VIEWED',
  'INVITED',
  'INTERVIEW',
  'HIRED',
  'NEW',
] as const;

/**
 * Переписка. Диалог всегда открывает работодатель: пока он не отреагировал
 * на отклик, письмо студента было бы монологом в пустоту.
 *
 * `applicationIndex` — позиция отклика в том же порядке, в каком они
 * создаются, `minutesAgo` — давность, `read` — прочитано ли.
 */
export const DEMO_CHAT = [
  {
    applicationIndex: 0,
    author: 'EMPLOYER' as const,
    body: 'Здравствуйте, Алиса! Посмотрели ваш профиль — график подходит под наши утренние смены. Когда удобно созвониться минут на десять?',
    minutesAgo: 180,
    read: true,
  },
  {
    applicationIndex: 0,
    author: 'STUDENT' as const,
    body: 'Добрый день! Спасибо. Удобно в будни после 17:00 или в субботу днём.',
    minutesAgo: 165,
    read: true,
  },
  {
    applicationIndex: 0,
    author: 'EMPLOYER' as const,
    body: 'Отлично, давайте в четверг в 18:00 — позвоню на номер из профиля. Медкнижку поможем оформить, приносить ничего не нужно.',
    minutesAgo: 24,
    read: false,
  },
  {
    applicationIndex: 2,
    author: 'EMPLOYER' as const,
    body: 'Добрый день! Готовы пригласить вас на смену-стажировку в эту субботу. Подходит?',
    minutesAgo: 900,
    read: false,
  },
];
