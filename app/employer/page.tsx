import type { Metadata } from 'next';
import { Building2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { EmployerBoard } from '@/components/screens/EmployerBoard';
import { agencySiteUrl } from '@/lib/agency';
import { countUnread } from '@/lib/chat';
import { requireEmployerPage } from '@/lib/security/guards';
import { employerNav } from '@/lib/employer-nav';
import { buildEmployerBoard } from '@/lib/services';

export const metadata: Metadata = { title: 'Кабинет работодателя' };
export const dynamic = 'force-dynamic';

export default async function EmployerPage() {
  const { employer } = await requireEmployerPage('/employer');
  const [board, unread] = await Promise.all([
    buildEmployerBoard(employer.id),
    countUnread({ role: 'EMPLOYER', profileId: employer.id }),
  ]);

  const agencyUrl = agencySiteUrl();

  return (
    <AppShell
      user={{ name: employer.companyName, subtitle: employer.contactName, href: '/employer/company' }}
      nav={employerNav(board.applications.length, unread)}
    >
      {/*
        Ищут не только студентов на подработку — иногда нужен готовый
        специалист, а этим уже занимается агентство отдельно. Компания
        может не знать, что за той же вывеской есть кадровое агентство:
        показываем, пока профиль не объединён с CRM — там своя ссылка
        на кабинет клиента (см. CrmEnterPanel в CompanyEditor).
      */}
      {agencyUrl && !employer.crmClientId && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--hairline)] bg-graphite-950/40 p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--hairline)] bg-graphite-900/50">
              <Building2 className="size-4.5 text-paper/60" aria-hidden />
            </span>
            <div>
              <p className="text-[13.5px] font-medium text-paper">У нас есть ещё и кадровое агентство</p>
              <p className="mt-0.5 text-[12.5px] text-paper-dim">
                Нужен не студент, а готовый специалист — подберём сами. Загляните, что предлагаем.
              </p>
            </div>
          </div>
          <a
            href={agencyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 shrink-0 items-center rounded-xl border border-[var(--hairline-strong)] bg-graphite-900/40 px-3.5 text-[13px] text-paper backdrop-blur-sm transition-colors hover:bg-graphite-800/60 hover:border-paper/25"
          >
            Посмотреть
          </a>
        </div>
      )}
      <EmployerBoard board={board} />
    </AppShell>
  );
}
