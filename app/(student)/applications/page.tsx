import type { Metadata } from 'next';
import { ApplicationsList } from '@/components/screens/ApplicationsList';
import { getStore } from '@/lib/db';
import { requireStudentPage } from '@/lib/security/guards';
import { buildStudyState, listApplications, listPendingApplications } from '@/lib/services';

export const metadata: Metadata = { title: 'Мои отклики' };
export const dynamic = 'force-dynamic';

export default async function ApplicationsPage() {
  const { student } = await requireStudentPage('/applications');
  const [applications, pending] = await Promise.all([
    listApplications(student.id),
    listPendingApplications(student.id),
    // Гасит счётчик в навигации — открыл вкладку, значит увидел, что там
    (await getStore()).students.markApplicationsViewed(student.id),
  ]);
  return <ApplicationsList applications={applications} pending={pending} study={buildStudyState(student)} />;
}
