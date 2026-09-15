import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/AppShell';
import { ModerationQueue } from '@/components/screens/ModerationQueue';
import { adminNav } from '@/lib/admin-nav';
import { requireAdminPage } from '@/lib/security/guards';
import { buildModerationQueue, countPendingStudyDocs } from '@/lib/services';

export const metadata: Metadata = { title: 'Модерация' };
export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  const session = await requireAdminPage('/admin/moderation', 'moderation');
  const [queue, pendingStudy] = await Promise.all([buildModerationQueue(), countPendingStudyDocs()]);

  return (
    <AppShell
      user={{ name: session.name || 'HR-менеджер', subtitle: 'Fattakhov HR Agency' }}
      nav={adminNav(queue.companies.length + queue.vacancies.length, pendingStudy, session.permissions)}
      wide
    >
      <ModerationQueue companies={queue.companies} vacancies={queue.vacancies} />
    </AppShell>
  );
}
