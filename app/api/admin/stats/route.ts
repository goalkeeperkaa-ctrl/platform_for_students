import { handle, ok } from '@/lib/api';
import { requireStaff } from '@/lib/security/guards';
import { staffCan } from '@/lib/staff-permissions';
import { buildAdminStats, listAuditEntries, listSyncRuns } from '@/lib/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    const session = await requireStaff();
    const canSeeLog = staffCan(session, 'pilot');
    const [stats, runs, auditEntries] = await Promise.all([
      buildAdminStats(),
      canSeeLog ? listSyncRuns(8) : Promise.resolve([]),
      canSeeLog ? listAuditEntries(24) : Promise.resolve([]),
    ]);
    return ok({ stats, runs, audit: auditEntries });
  });
}
