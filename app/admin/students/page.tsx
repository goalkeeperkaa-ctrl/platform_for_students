import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/AppShell';
import { AdminStudents } from '@/components/screens/AdminStudents';
import { adminNav } from '@/lib/admin-nav';
import { requireAdminPage } from '@/lib/security/guards';
import { countPendingModeration, countPendingStudyDocs, listAdminStudents, listInstitutionOptions } from '@/lib/services';

export const metadata: Metadata = { title: 'Студенты' };
export const dynamic = 'force-dynamic';

export default async function AdminStudentsPage() {
  const session = await requireAdminPage('/admin/students', 'students');
  const [students, institutions, pending, pendingStudy] = await Promise.all([
    listAdminStudents(),
    listInstitutionOptions(),
    countPendingModeration(),
    countPendingStudyDocs(),
  ]);

  return (
    <AppShell
      user={{ name: session.name || 'HR-менеджер', subtitle: 'Fattakhov HR Agency' }}
      nav={adminNav(pending, pendingStudy, session.permissions)}
      wide
    >
      <AdminStudents students={students} institutions={institutions} />
    </AppShell>
  );
}
