import { handle, ok } from '@/lib/api';
import { requireStudent } from '@/lib/security/guards';
import { listApplications, listPendingApplications } from '@/lib/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Свои отклики и те, что ждут подтверждения учёбы. */
export async function GET() {
  return handle(async () => {
    const { student } = await requireStudent();
    const [applications, pending] = await Promise.all([
      listApplications(student.id),
      listPendingApplications(student.id),
    ]);
    return ok({ applications, pending });
  });
}
