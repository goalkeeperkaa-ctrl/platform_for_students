import { fail, handle, ok } from '@/lib/api';
import { getStore } from '@/lib/db';
import { assertSameOrigin, audit, requireRole } from '@/lib/security/guards';
import { listAdminStudents } from '@/lib/services';
import { adminStudentUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Все студенты для HR — с вузом, статусом и отметкой о подтверждении учёбы. */
export async function GET() {
  return handle(async () => {
    await requireRole('ADMIN');
    return ok({ students: await listAdminStudents() });
  });
}

/**
 * HR меняет студента: статус (пауза, возврат в поиск) и отметку «учёба
 * подтверждена» — после проверки студенческого или справки. Каждое
 * изменение — отдельная запись в журнале: подтверждение учёбы работодатель
 * видит как факт, и должно быть видно, кто его поставил.
 */
export async function PATCH(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireRole('ADMIN');
    const { studentId, status, studyVerified } = adminStudentUpdateSchema.parse(await request.json());

    const store = await getStore();
    const student = await store.students.findById(studentId);
    if (!student) return fail(404, 'Студент не найден', 'NOT_FOUND');

    if (status !== undefined) {
      await store.students.setStatus(studentId, status);
      await audit(
        session,
        { action: 'student.status', entity: 'Student', entityId: studentId, meta: { status } },
        request.headers,
      );
    }

    if (studyVerified !== undefined) {
      await store.students.setStudyVerified(studentId, studyVerified);
      await audit(
        session,
        {
          action: studyVerified ? 'student.study.verified' : 'student.study.unverified',
          entity: 'Student',
          entityId: studentId,
        },
        request.headers,
      );
    }

    return ok({
      studentId,
      status: status ?? student.status,
      studyVerified: studyVerified ?? student.studyVerified,
    });
  });
}
