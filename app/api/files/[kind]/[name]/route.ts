import { NextResponse } from 'next/server';
import { fail, handle } from '@/lib/api';
import { getStore } from '@/lib/db';
import { getSession } from '@/lib/security/guards';
import { staffCan } from '@/lib/staff-permissions';
import { readStored } from '@/lib/storage';
import { isVacancyVisible } from '@/lib/vacancy';
import type { SessionUser } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Раздача фото, резюме и справок.
 *
 * Файлы — персональные данные, поэтому доступ проверяется на каждый
 * запрос, а не однократно при выдаче ссылки. Правило простое: студент
 * видит только свои файлы, работодатель — фото и резюме тех, кто
 * откликнулся на его вакансии, администратор — все. Справку об обучении
 * работодатель не видит никогда: учёбу за него проверяет агентство.
 */
export async function GET(
  _request: Request,
  { params }: { params: { kind: string; name: string } },
) {
  return handle(async () => {
    const session = await getSession();

    // Логотип, фото и видео компании — не персональные данные, их видит и
    // гость на странице компании. Но только одобренной: страница компании
    // на модерации не публична, и её медиафайлы тоже.
    if (params.kind === 'company' || params.kind === 'companyVideo') {
      return readCompanyFile(session, params.kind, params.name);
    }

    if (!session) return fail(401, 'Требуется вход в систему', 'UNAUTHORIZED');

    const url = `/api/files/${params.kind}/${params.name}`;
    if (!(await canRead(session, url))) {
      // 404, а не 403: существование чужого файла — тоже информация
      return fail(404, 'Файл не найден', 'NOT_FOUND');
    }

    const { body, type } = await readStored(params.kind, params.name);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': type,
        // private: файл персональный, его не должен кешировать общий прокси
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}

async function readCompanyFile(session: SessionUser | null, kind: 'company' | 'companyVideo', name: string) {
  const url = `/api/files/${kind}/${name}`;
  const store = await getStore();
  const employers = await store.employers.list();
  let owner =
    kind === 'company'
      ? employers.find((e) => e.logoUrl === url || e.photos.includes(url))
      : employers.find((e) => e.videoUrl === url);
  let isPublic = owner?.moderationStatus === 'APPROVED';

  if (!owner) {
    // Фото или видео вакансии публично ровно тогда, когда видна хотя бы
    // одна вакансия с ним: черновик и вакансия на проверке своих медиа не
    // раскрывают, но и не прячут то, что стоит ещё и в опубликованной
    const vacancies = kind === 'company' ? await store.vacancies.listByPhoto(url) : await store.vacancies.listByVideo(url);
    if (vacancies.length > 0) {
      owner = employers.find((e) => e.id === vacancies[0].employerId);
      isPublic = vacancies.some((v) => isVacancyVisible(v, employers.find((e) => e.id === v.employerId)));
    }
  }

  const isOwner = !!owner && !!session && session.role === 'EMPLOYER' && session.accountId === owner.accountId;
  const isAdmin = session?.role === 'ADMIN';

  // Файл, который ни одна компания не использует, гостю не отдаётся:
  // иначе загрузка превращалась бы в бесплатный публичный хостинг медиа.
  // Только что загруженный файл ещё ни одной компании не принадлежит:
  // его сохранят в странице позже. Работодателю он нужен для превью в
  // форме. Гость такие файлы не видит, а имя файла — случайный UUID.
  const isFreshUpload = !owner && session?.role === 'EMPLOYER';

  if (!isAdmin && !isOwner && !isPublic && !isFreshUpload) {
    return fail(404, 'Файл не найден', 'NOT_FOUND');
  }

  const { body, type } = await readStored(kind, name);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': type,
      'Cache-Control': isPublic ? 'public, max-age=3600' : 'private, max-age=300',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function canRead(session: SessionUser, url: string): Promise<boolean> {
  // Сотрудник из CRM видит файлы студентов, только если ему выданы студенты или модерация
  if (session.role === 'ADMIN') return staffCan(session, 'students') || staffCan(session, 'moderation');
  const store = await getStore();

  if (session.role === 'STUDENT') {
    const student = await store.students.findByAccountId(session.accountId);
    return (
      !!student &&
      (student.photoUrl === url ||
        student.resumeUrl === url ||
        student.studyDocUrl === url ||
        student.videoUrl === url)
    );
  }

  if (session.role === 'EMPLOYER') {
    const employer = await store.employers.findByAccountId(session.accountId);
    if (!employer) return false;
    const vacancies = await store.vacancies.listByEmployer(employer.id);
    const applications = await store.applications.listByVacancyIds(vacancies.map((v) => v.id));
    for (const application of applications) {
      const student = await store.students.findById(application.studentId);
      if (student && (student.photoUrl === url || student.resumeUrl === url || student.videoUrl === url)) return true;
    }
  }

  return false;
}
