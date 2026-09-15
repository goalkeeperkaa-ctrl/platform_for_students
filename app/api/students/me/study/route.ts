import { fail, handle, ok } from '@/lib/api';
import { assertSameOrigin, audit, requireStudent } from '@/lib/security/guards';
import { buildStudyState } from '@/lib/services';
import { deleteStored } from '@/lib/storage';
import { studyDocSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Справка об обучении: отправить на проверку, заменить, отозвать.
 *
 * Идентификатор студента — из сессии, файл — только вида `study`: схема не
 * пропустит путь к фото или резюме, иначе через справку можно было бы
 * показать HR чужой файл. Прежний файл удаляется сразу: справка — ПДн, и
 * хранить её дольше нужного незачем.
 */
export async function GET() {
  return handle(async () => {
    const { student } = await requireStudent();
    return ok({ study: buildStudyState(student) });
  });
}

export async function PUT(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { session, student, store } = await requireStudent();
    if (student.studyVerified) {
      return fail(409, 'Учёба уже подтверждена — справка не нужна', 'ALREADY_VERIFIED');
    }

    const input = studyDocSchema.parse(await request.json());
    const previous = student.studyDocUrl;
    const updated = await store.students.setStudyDocument(student.id, { url: input.url, name: input.name });
    if (!updated) return fail(404, 'Профиль не найден', 'NOT_FOUND');
    if (previous && previous !== input.url) await deleteStored(previous);

    await audit(session, { action: 'student.study.submitted', entity: 'Student', entityId: student.id }, request.headers);
    return ok({ study: buildStudyState(updated) });
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { session, student, store } = await requireStudent();
    if (!student.studyDocUrl) return ok({ study: buildStudyState(student) });

    const updated = await store.students.setStudyDocument(student.id, null);
    await deleteStored(student.studyDocUrl);
    await audit(session, { action: 'student.study.withdrawn', entity: 'Student', entityId: student.id }, request.headers);
    return ok({ study: buildStudyState(updated ?? student) });
  });
}
