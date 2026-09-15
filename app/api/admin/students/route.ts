import { fail, handle, ok } from '@/lib/api';
import { getStore } from '@/lib/db';
import { assertSameOrigin, audit, requireStaff } from '@/lib/security/guards';
import { listAdminStudents, releasePendingApplications } from '@/lib/services';
import { notifyNewApplications, notifyStudyDecision } from '@/lib/notify';
import { deleteStored } from '@/lib/storage';
import { adminStudentUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Все студенты для HR — с вузом, статусом, справкой и отметкой о подтверждении учёбы. */
export async function GET() {
  return handle(async () => {
    await requireStaff('students');
    return ok({ students: await listAdminStudents() });
  });
}

/**
 * HR меняет студента: статус (пауза, возврат в поиск), подтверждение учёбы
 * и решение по справке.
 *
 * Подтверждение учёбы отправляет работодателям отклики, которые ждали его.
 * Файл справки после решения удаляется: он был нужен только для проверки, а
 * хранить ПДн дольше нужного незачем. Каждое изменение — отдельная запись в
 * журнале: подтверждение учёбы работодатель видит как факт, и должно быть
 * видно, кто его поставил.
 */
export async function PATCH(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireStaff('students');
    const { studentId, status, studyVerified, studyDecision, note } = adminStudentUpdateSchema.parse(
      await request.json(),
    );

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

    if (studyDecision === 'REJECT') {
      if (!student.studyDocUrl) return fail(409, 'Справки на проверке нет', 'NO_DOCUMENT');
      await store.students.rejectStudy(studentId, note ?? '');
      await deleteStored(student.studyDocUrl);
      await audit(session, { action: 'student.study.rejected', entity: 'Student', entityId: studentId }, request.headers);
      await notifyStudyDecision(student, { approved: false, note: note ?? '' });
    }

    let released: string[] = [];
    const verify = studyDecision === 'APPROVE' ? true : studyVerified;
    if (verify !== undefined) {
      await store.students.setStudyVerified(studentId, verify);
      if (verify && student.studyDocUrl) await deleteStored(student.studyDocUrl);
      await audit(
        session,
        {
          action: verify ? 'student.study.verified' : 'student.study.unverified',
          entity: 'Student',
          entityId: studentId,
          meta: { byDocument: studyDecision === 'APPROVE' },
        },
        request.headers,
      );
      if (verify) {
        released = await releasePendingApplications(studentId);
        if (released.length > 0) {
          await audit(
            session,
            { action: 'application.released', entity: 'Student', entityId: studentId, meta: { count: released.length } },
            request.headers,
          );
        }
        // Письмо — когда отметка появилась, а не при повторном нажатии
        if (!student.studyVerified) await notifyStudyDecision(student, { approved: true, released: released.length });
        await notifyNewApplications(released);
      }
    }

    const fresh = await store.students.findById(studentId);
    return ok({
      studentId,
      status: fresh?.status ?? student.status,
      studyVerified: fresh?.studyVerified ?? student.studyVerified,
      released: released.length,
    });
  });
}
