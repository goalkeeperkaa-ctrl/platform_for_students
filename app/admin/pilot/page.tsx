import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/AppShell';
import { PilotDashboard } from '@/components/screens/PilotDashboard';
import { adminNav } from '@/lib/admin-nav';
import { requireAdminPage } from '@/lib/security/guards';
import { buildPilotMetrics, countPendingModeration } from '@/lib/services';

export const metadata: Metadata = { title: 'Метрики пилота' };
export const dynamic = 'force-dynamic';

export default async function AdminPilotPage() {
  const session = await requireAdminPage('/admin/pilot');
  const [metrics, pending] = await Promise.all([buildPilotMetrics(), countPendingModeration()]);

  return (
    <AppShell
      user={{ name: session.name || 'HR-менеджер', subtitle: 'Fattakhov HR Agency' }}
      nav={adminNav(pending)}
      wide
    >
      <PilotDashboard metrics={metrics} />
    </AppShell>
  );
}
