import { NextResponse } from 'next/server';
import { fail, handle } from '@/lib/api';
import { getStore } from '@/lib/db';
import { getSession } from '@/lib/security/guards';
import { readStored } from '@/lib/storage';
import type { SessionUser } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Раздача фото и резюме.
 *
 * Файлы — персональные данные, поэтому доступ проверяется на каждый
 * запрос, а не однократно при выдаче ссылки. Правило простое: студент
 * видит только свои файлы, работодатель — файлы тех, кто откликнулся
 * на его вакансии, администратор — все.
 */
export async function GET(
  _request: Request,
  { params }: { params: { kind: string; name: string } },
) {
  return handle(async () => {
    const session = await getSession();

    // Логотип и фото компании — не персональные данные, их видит и гость
    // на странице компании. Но только одобренной: страница компании на
    // модерации не публична, и её картинки тоже.
    if (params.kind === 'company') return readCompanyFile(session, params.name);

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

async function readCompanyFile(session: SessionUser | null, name: string) {
  const url = `/api/files/company/${name}`;
  const store = await getStore();
  const owner = (await store.employers.list()).find(
    (e) => e.logoUrl === url || e.photos.includes(url),
  );

  const isOwner = !!owner && !!session && session.role === 'EMPLOYER' && session.accountId === owner.accountId;
  const isAdmin = session?.role === 'ADMIN';
  const isPublic = owner?.moderationStatus === 'APPROVED';

  // Файл, который ни одна компания не использует, гостю не отдаётся:
  // иначе загрузка превращалась бы в бесплатный публичный хостинг картинок
  // Только что загруженная картинка ещё ни одной компании не принадлежит:
  // её сохранят в странице позже. Работодателю она нужна для превью в
  // форме. Гость такие файлы не видит, а имя файла — случайный UUID.
  const isFreshUpload = !owner && session?.role === 'EMPLOYER';

  if (!isAdmin && !isOwner && !isPublic && !isFreshUpload) {
    return fail(404, 'Файл не найден', 'NOT_FOUND');
  }

  const { body, type } = await readStored('company', name);
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
  if (session.role === 'ADMIN') return true;
  const store = await getStore();

  if (session.role === 'STUDENT') {
    const student = await store.students.findByAccountId(session.accountId);
    return !!student && (student.photoUrl === url || student.resumeUrl === url);
  }

  if (session.role === 'EMPLOYER') {
    const employer = await store.employers.findByAccountId(session.accountId);
    if (!employer) return false;
    const vacancies = await store.vacancies.listByEmployer(employer.id);
    const applications = await store.applications.listByVacancyIds(vacancies.map((v) => v.id));
    for (const application of applications) {
      const student = await store.students.findById(application.studentId);
      if (student && (student.photoUrl === url || student.resumeUrl === url)) return true;
    }
  }

  return false;
}
