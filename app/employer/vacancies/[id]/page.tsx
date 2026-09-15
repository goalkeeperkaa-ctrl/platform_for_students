import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { VacancyEditor } from '@/components/screens/VacancyEditor';
import { countUnread } from '@/lib/chat';
import { employerNav } from '@/lib/employer-nav';
import { requireEmployerPage } from '@/lib/security/guards';
import { buildEmployerBoard, getEmployerVacancy, listEmployerAddresses } from '@/lib/services';
import { vacancyToForm } from '@/lib/vacancy';

export const metadata: Metadata = { title: 'Вакансия' };
export const dynamic = 'force-dynamic';

type Props = { params: { id: string } };

export default async function EditVacancyPage({ params }: Props) {
  const { employer } = await requireEmployerPage(`/employer/vacancies/${params.id}`);
  // Чужая вакансия — 404, как несуществующая
  const vacancy = await getEmployerVacancy(employer.id, params.id);
  if (!vacancy) notFound();

  const [board, unread, addresses] = await Promise.all([
    buildEmployerBoard(employer.id),
    countUnread({ role: 'EMPLOYER', profileId: employer.id }),
    listEmployerAddresses(employer.id),
  ]);

  return (
    <AppShell
      user={{ name: employer.companyName, subtitle: employer.contactName }}
      nav={employerNav(board.applications.length, unread)}
    >
      {vacancy.crmId ? (
        <div className="mx-auto w-full max-w-[46rem]">
          <Link
            href="/employer/vacancies"
            className="inline-flex items-center gap-1.5 text-[13px] text-paper-faint transition-colors hover:text-paper"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Все вакансии
          </Link>
          <section className="glass mt-4 rounded-3xl p-6 sm:p-8">
            <h1 className="break-words text-display-sm text-paper">{vacancy.title}</h1>
            <p className="mt-3 text-[14.5px] leading-relaxed text-paper-dim">
              Эту вакансию ведёт агентство через CRM: правку отсюда перезаписала бы следующая
              синхронизация. Чтобы изменить вакансию или снять её, напишите своему менеджеру в агентстве.
            </p>
          </section>
        </div>
      ) : (
        <VacancyEditor
          vacancyId={vacancy.id}
          status={vacancy.status}
          moderationNote={vacancy.status === 'REJECTED' ? vacancy.moderationNote : null}
          initial={vacancyToForm(vacancy)}
          companyStatus={employer.moderationStatus}
          knownAddresses={addresses.filter((a) => a.address !== vacancy.address || a.city !== vacancy.city)}
        />
      )}
    </AppShell>
  );
}
