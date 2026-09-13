import 'server-only';
import { getStore } from '@/lib/db';
import { studentName } from '@/lib/db/mappers';
import { decryptSafe } from '@/lib/security/crypto';
import { studentFacingVacancy } from '@/lib/vacancy';
import type { ApplicationRecord, MessageRecord } from '@/lib/db/types';
import type {
  ApplicationStatus,
  MessageAuthor,
  MessageDTO,
  SessionUser,
  ThreadDTO,
  ThreadSummaryDTO,
} from '@/lib/types';

/**
 * Переписка студента и работодателя.
 *
 * Диалог привязан к отклику, а не к паре «человек — компания»: люди
 * обсуждают конкретную вакансию, и переписка по бариста не должна
 * смешиваться с перепиской по помощнику управляющего.
 *
 * HR-менеджер агентства в переписку не входит. Он видит, что диалог
 * идёт, и по каким откликам движение есть, но не содержание: посредник
 * между людьми — не основание читать их личную переписку.
 */

/** Кто смотрит. Роль решает и что он видит, и может ли писать. */
export interface Viewer {
  role: MessageAuthor;
  profileId: string;
}

/**
 * Участник переписки из сессии. null — значит смотрящий вообще не сторона
 * диалога: гость или HR-менеджер агентства.
 */
export function viewerFromSession(session: SessionUser | null): Viewer | null {
  if (!session || !session.profileId) return null;
  if (session.role !== 'STUDENT' && session.role !== 'EMPLOYER') return null;
  return { role: session.role, profileId: session.profileId };
}

/**
 * Можно ли писать прямо сейчас.
 *
 * Диалог открывает работодатель. Пока он не отреагировал на отклик,
 * письмо студента было бы монологом в пустоту, а у компании с сотней
 * откликов — потоком спама. После отказа переписка со стороны студента
 * закрывается: решение принято, и спорить с ним в чате незачем.
 */
function writePermission(
  status: ApplicationStatus,
  role: MessageAuthor,
  employerWrote: boolean,
): { canWrite: boolean; lockedReason: string | null } {
  if (role === 'EMPLOYER') return { canWrite: true, lockedReason: null };
  if (status === 'REJECTED') {
    return { canWrite: false, lockedReason: 'Работодатель закрыл отклик — переписка в архиве' };
  }
  if (status === 'NEW' && !employerWrote) {
    return {
      canWrite: false,
      lockedReason: 'Работодатель ещё не открыл отклик. Написать можно, когда он ответит',
    };
  }
  return { canWrite: true, lockedReason: null };
}

function toMessageDTO(m: MessageRecord, viewer: MessageAuthor): MessageDTO {
  return {
    id: m.id,
    author: m.author,
    body: decryptSafe(m.bodyEnc, '[сообщение не читается]'),
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt?.toISOString() ?? null,
    mine: m.author === viewer,
  };
}

/** Строка предпросмотра в списке. Режем здесь, а не в вёрстке: незачем
 *  гонять в браузер килобайты ради одной строки. */
function preview(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > 90 ? `${flat.slice(0, 89)}…` : flat;
}

/**
 * Загружает ветку вместе с проверкой прав. null — либо нет такой ветки,
 * либо она чужая; наружу эти два случая не различаются намеренно.
 */
async function loadContext(applicationId: string, viewer: Viewer) {
  const store = await getStore();
  const application = await store.applications.findById(applicationId);
  if (!application) return null;

  const vacancy = await store.vacancies.findById(application.vacancyId);
  if (!vacancy) return null;

  if (viewer.role === 'STUDENT' && application.studentId !== viewer.profileId) return null;
  if (viewer.role === 'EMPLOYER' && vacancy.employerId !== viewer.profileId) return null;

  const [student, employer] = await Promise.all([
    store.students.findById(application.studentId),
    store.employers.findById(vacancy.employerId),
  ]);
  if (!student || !employer) return null;

  return { store, application, vacancy, student, employer };
}

type Context = NonNullable<Awaited<ReturnType<typeof loadContext>>>;

function buildSummary(
  ctx: Context,
  viewer: Viewer,
  last: MessageRecord | undefined,
  unread: number,
  employerWrote: boolean,
): ThreadSummaryDTO {
  const { application, vacancy, student, employer } = ctx;
  const permission = writePermission(application.status, viewer.role, employerWrote);

  // Собеседник — всегда противоположная сторона: студент видит компанию,
  // компания видит человека
  const counterpart =
    viewer.role === 'STUDENT'
      ? { name: employer.companyName, photoUrl: employer.logoUrl, subtitle: employer.contactName }
      : {
          name: studentName(student),
          photoUrl: student.photoUrl,
          subtitle: `${student.university}, ${student.studyYear} курс`,
        };

  return {
    applicationId: application.id,
    vacancyId: vacancy.id,
    // Студенту — одобренное название, пока правка компании на проверке
    vacancyTitle: viewer.role === 'STUDENT' ? studentFacingVacancy(vacancy, employer).title : vacancy.title,
    company: employer.companyName,
    counterpartName: counterpart.name,
    counterpartPhotoUrl: counterpart.photoUrl,
    counterpartSubtitle: counterpart.subtitle,
    status: application.status,
    lastMessageBody: last ? preview(decryptSafe(last.bodyEnc, '…')) : null,
    lastMessageAuthor: last?.author ?? null,
    lastMessageAt: last?.createdAt.toISOString() ?? null,
    unread,
    canWrite: permission.canWrite,
    lockedReason: permission.lockedReason,
  };
}

async function applicationsFor(viewer: Viewer): Promise<ApplicationRecord[]> {
  const store = await getStore();
  if (viewer.role === 'STUDENT') return store.applications.listByStudent(viewer.profileId);
  const vacancies = await store.vacancies.listByEmployer(viewer.profileId);
  return store.applications.listByVacancyIds(vacancies.map((v) => v.id));
}

/**
 * Список диалогов. Свежие сверху; отклики без переписки тоже показаны —
 * иначе студент не поймёт, где ещё ждать ответа.
 */
export async function listThreads(viewer: Viewer): Promise<ThreadSummaryDTO[]> {
  const store = await getStore();
  const applications = await applicationsFor(viewer);
  if (applications.length === 0) return [];

  const ids = applications.map((a) => a.id);
  const [unread, lastByApp] = await Promise.all([
    store.messages.unreadFor(ids, viewer.role),
    store.messages.lastFor(ids),
  ]);

  const out: ThreadSummaryDTO[] = [];
  for (const application of applications) {
    const ctx = await loadContext(application.id, viewer);
    if (!ctx) continue;
    const last = lastByApp[application.id];
    // Достаточно знать, что работодатель писал хоть раз: подтягивать всю
    // ветку ради одного флага на каждый диалог — лишние запросы
    const employerWrote = last
      ? last.author === 'EMPLOYER' ||
        (await store.messages.listByApplication(application.id)).some((m) => m.author === 'EMPLOYER')
      : false;
    out.push(buildSummary(ctx, viewer, last, unread[application.id] ?? 0, employerWrote));
  }

  return out.sort((a, b) => {
    const at = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const bt = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    return bt - at;
  });
}

export async function getThread(applicationId: string, viewer: Viewer): Promise<ThreadDTO | null> {
  const ctx = await loadContext(applicationId, viewer);
  if (!ctx) return null;

  const messages = await ctx.store.messages.listByApplication(applicationId);
  const employerWrote = messages.some((m) => m.author === 'EMPLOYER');
  const unread = messages.filter((m) => m.author !== viewer.role && !m.readAt).length;
  const summary = buildSummary(ctx, viewer, messages[messages.length - 1], unread, employerWrote);

  return { ...summary, messages: messages.map((m) => toMessageDTO(m, viewer.role)) };
}

export class ThreadLockedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ThreadLockedError';
  }
}

/** Противоположная сторона ветки — адресат уведомления о событии. */
function counterpartOf(ctx: Context, viewer: Viewer): Viewer {
  return viewer.role === 'STUDENT'
    ? { role: 'EMPLOYER', profileId: ctx.vacancy.employerId }
    : { role: 'STUDENT', profileId: ctx.application.studentId };
}

export interface PostResult {
  message: MessageDTO;
  /** Кого разбудить живым обновлением */
  recipient: Viewer;
}

export async function postMessage(
  applicationId: string,
  viewer: Viewer,
  body: string,
): Promise<PostResult | null> {
  const ctx = await loadContext(applicationId, viewer);
  if (!ctx) return null;

  const messages = await ctx.store.messages.listByApplication(applicationId);
  const permission = writePermission(
    ctx.application.status,
    viewer.role,
    messages.some((m) => m.author === 'EMPLOYER'),
  );
  // Право писать проверяется здесь, а не только кнопкой в интерфейсе:
  // заблокированную кнопку обходит любой, кто откроет консоль
  if (!permission.canWrite) {
    throw new ThreadLockedError(permission.lockedReason ?? 'Переписка закрыта');
  }

  const record = await ctx.store.messages.create({ applicationId, author: viewer.role, body });

  // Первое сообщение работодателя двигает отклик из «нового»: он уже не
  // новый, раз с человеком заговорили
  if (viewer.role === 'EMPLOYER' && ctx.application.status === 'NEW') {
    await ctx.store.applications.setStatus(applicationId, 'VIEWED');
  }

  return { message: toMessageDTO(record, viewer.role), recipient: counterpartOf(ctx, viewer) };
}

export interface ReadResult {
  count: number;
  /** Автор прочитанных сообщений — ему и показываем «прочитано» */
  recipient: Viewer;
}

export async function markThreadRead(
  applicationId: string,
  viewer: Viewer,
): Promise<ReadResult | null> {
  const ctx = await loadContext(applicationId, viewer);
  if (!ctx) return null;
  const count = await ctx.store.messages.markRead(applicationId, viewer.role);
  return { count, recipient: counterpartOf(ctx, viewer) };
}

/** Счётчик для значка в навигации. */
export async function countUnread(viewer: Viewer): Promise<number> {
  const store = await getStore();
  const ids = (await applicationsFor(viewer)).map((a) => a.id);
  if (ids.length === 0) return 0;
  const unread = await store.messages.unreadFor(ids, viewer.role);
  return Object.values(unread).reduce((sum, n) => sum + n, 0);
}
