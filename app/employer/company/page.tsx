import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/AppShell';
import { CompanyEditor } from '@/components/screens/CompanyEditor';
import { countUnread } from '@/lib/chat';
import { employerNav } from '@/lib/employer-nav';
import { decryptSafe } from '@/lib/security/crypto';
import { requireEmployerPage } from '@/lib/security/guards';
import { buildEmployerBoard } from '@/lib/services';

export const metadata: Metadata = { title: 'Страница компании' };
export const dynamic = 'force-dynamic';

export default async function EmployerCompanyPage() {
  const { employer } = await requireEmployerPage('/employer/company');
  const [board, unread] = await Promise.all([
    buildEmployerBoard(employer.id),
    countUnread({ role: 'EMPLOYER', profileId: employer.id }),
  ]);

  return (
    <AppShell
      user={{ name: employer.companyName, subtitle: employer.contactName }}
      nav={employerNav(board.applications.length, unread)}
    >
      <CompanyEditor
        companyId={employer.id}
        moderation={{ status: employer.moderationStatus, note: employer.moderationNote }}
        selfRegistered={employer.crmClientId === null}
        initial={{
          companyName: employer.companyName,
          contactName: employer.contactName,
          phone: decryptSafe(employer.phoneEnc, ''),
          inn: employer.inn ?? '',
          logoUrl: employer.logoUrl,
          about: employer.about ?? '',
          website: employer.website ?? '',
          city: employer.city ?? '',
          socials: employer.socials,
          photos: employer.photos,
          videoUrl: employer.videoUrl ?? '',
        }}
      />
    </AppShell>
  );
}
