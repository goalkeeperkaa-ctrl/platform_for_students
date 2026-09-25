import { z } from 'zod';
import { fail, handle, ok } from '@/lib/api';
import { getStore } from '@/lib/db';
import { auditService } from '@/lib/security/guards';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { listPendingStudyReview, releasePendingApplications } from '@/lib/services';
import { notifyNewApplications, notifyStudyDecision } from '@/lib/notify';
import { deleteStored } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Справки студентов, ждущие решения, — служебный API для «Проверок» в
 * CRM. Только очередь (studyDocUrl загружен, решения ещё нет), а не весь
 * список студентов: полное управление статусом студента здесь не нужно,
 * это отдельная задача от проверки документа.
 */
export async function GET(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    return ok({ students: await listPendingStudyReview() });
  });
}

const bodySchema = z.object({
  studentId: z.string().min(1),
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().max(500).optional(),
  actor: z.string().trim().min(1).max(200),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const { studentId, decision, note, actor } = bodySchema.parse(await request.json());

    const store = await getStore();
    const student = await store.students.findById(studentId);
    if (!student) return fail(404, 'Студент не найден', 'NOT_FOUND');
    if (!student.studyDocUrl) return fail(409, 'Справки на проверке нет', 'NO_DOCUMENT');

    let released: string[] = [];
    if (decision === 'REJECT') {
      await store.students.rejectStudy(studentId, note ?? '');
      await deleteStored(student.studyDocUrl);
      await auditService(actor, { action: 'student.study.rejected', entity: 'Student', entityId: studentId }, request.headers);
      await notifyStudyDecision(student, { approved: false, note: note ?? '' });
    } else {
      await store.students.setStudyVerified(studentId, true);
      await deleteStored(student.studyDocUrl);
      await auditService(
        actor,
        { action: 'student.study.verified', entity: 'Student', entityId: studentId, meta: { byDocument: true } },
        request.headers,
      );
      released = await releasePendingApplications(studentId);
      if (released.length > 0) {
        await auditService(
          actor,
          { action: 'application.released', entity: 'Student', entityId: studentId, meta: { count: released.length } },
          request.headers,
        );
      }
      await notifyStudyDecision(student, { approved: true, released: released.length });
      await notifyNewApplications(released);
    }

    const fresh = await store.students.findById(studentId);
    return ok({ studentId, studyVerified: fresh?.studyVerified ?? student.studyVerified, released: released.length });
  });
}
