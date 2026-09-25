import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/AppShell';
import { VacancyEditor } from '@/components/screens/VacancyEditor';
import { countUnread } from '@/lib/chat';
import { employerNav } from '@/lib/employer-nav';
import { requireEmployerPage } from '@/lib/security/guards';
import { PILOT_CITY } from '@/lib/pilot';
import { buildEmployerBoard, listEmployerAddresses } from '@/lib/services';
import { EMPTY_VACANCY_FORM } from '@/lib/vacancy';

export const metadata: Metadata = { title: 'Новая вакансия' };
export const dynamic = 'force-dynamic';

export default async function NewVacancyPage() {
  const { employer } = await requireEmployerPage('/employer/vacancies/new');
  const [board, unread, addresses] = await Promise.all([
    buildEmployerBoard(employer.id),
    countUnread({ role: 'EMPLOYER', profileId: employer.id }),
    listEmployerAddresses(employer.id),
  ]);

  return (
    <AppShell
      user={{ name: employer.companyName, subtitle: employer.contactName, href: '/employer/company' }}
      nav={employerNav(board.applications.length, unread)}
    >
      <VacancyEditor
        // Город компании подставлен сразу: чаще всего вакансия там же
        initial={{ ...EMPTY_VACANCY_FORM, city: employer.city ?? PILOT_CITY }}
        companyStatus={employer.moderationStatus}
        knownAddresses={addresses}
      />
    </AppShell>
  );
}
