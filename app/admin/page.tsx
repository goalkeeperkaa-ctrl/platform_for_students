import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/AppShell';
import { adminNav } from '@/lib/admin-nav';
import { AdminDashboard } from '@/components/screens/AdminDashboard';
import { requireAdminPage } from '@/lib/security/guards';
import { buildAdminStats, listAuditEntries, listSyncRuns } from '@/lib/services';

export const metadata: Metadata = { title: 'Панель HR-менеджера' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await requireAdminPage('/admin');
  const [stats, runs, audit] = await Promise.all([
    buildAdminStats(),
    listSyncRuns(8),
    listAuditEntries(24),
  ]);

  return (
    <AppShell
      user={{ name: session.name || 'HR-менеджер', subtitle: 'Fattakhov HR Agency' }}
      nav={adminNav(stats.moderation.companies + stats.moderation.vacancies)}
      wide
    >
      <AdminDashboard stats={stats} runs={runs} audit={audit} />
    </AppShell>
  );
}
