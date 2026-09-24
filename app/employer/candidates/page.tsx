import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/AppShell';
import { CandidatesScreen } from '@/components/screens/CandidatesScreen';
import { countUnread } from '@/lib/chat';
import { employerNav } from '@/lib/employer-nav';
import { requireEmployerPage } from '@/lib/security/guards';
import { buildEmployerBoard, listEmployerVacancies } from '@/lib/services';

export const metadata: Metadata = { title: 'Кандидаты' };
export const dynamic = 'force-dynamic';

export default async function EmployerCandidatesPage() {
  const { employer } = await requireEmployerPage('/employer/candidates');
  const [board, unread, vacancies] = await Promise.all([
    buildEmployerBoard(employer.id),
    countUnread({ role: 'EMPLOYER', profileId: employer.id }),
    listEmployerVacancies(employer.id),
  ]);

  return (
    <AppShell
      user={{ name: employer.companyName, subtitle: employer.contactName }}
      nav={employerNav(board.applications.length, unread)}
    >
      <CandidatesScreen vacancies={vacancies.filter((v) => v.status !== 'CLOSED')} />
    </AppShell>
  );
}
