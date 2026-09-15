import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/AppShell';
import { adminNav } from '@/lib/admin-nav';
import { AdminDashboard } from '@/components/screens/AdminDashboard';
import { requireAdminPage } from '@/lib/security/guards';
import { staffCan } from '@/lib/staff-permissions';
import { buildAdminStats, countPendingStudyDocs, listAuditEntries, listSyncRuns } from '@/lib/services';

export const metadata: Metadata = { title: 'Панель HR-менеджера' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await requireAdminPage('/admin');
  // Журнал и выгрузки из CRM — тем, кому выданы метрики пилота
  const canSeeLog = staffCan(session, 'pilot');
  const [stats, runs, audit, pendingStudy] = await Promise.all([
    buildAdminStats(),
    canSeeLog ? listSyncRuns(8) : Promise.resolve([]),
    canSeeLog ? listAuditEntries(24) : Promise.resolve([]),
    countPendingStudyDocs(),
  ]);

  return (
    <AppShell
      user={{ name: session.name || 'HR-менеджер', subtitle: 'Fattakhov HR Agency' }}
      nav={adminNav(stats.moderation.companies + stats.moderation.vacancies, pendingStudy, session.permissions)}
      wide
    >
      <AdminDashboard stats={stats} runs={runs} audit={audit} />
    </AppShell>
  );
}
