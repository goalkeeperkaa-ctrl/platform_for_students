import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { countUnread } from '@/lib/chat';
import { getStore } from '@/lib/db';
import { studentName } from '@/lib/db/mappers';
import { getSessionWithRole } from '@/lib/security/guards';
import { countWaitingApplications } from '@/lib/services';

export const dynamic = 'force-dynamic';

/**
 * Каркас студенческих разделов.
 *
 * Счётчики во вкладках считаются здесь, а не внутри страниц: студент
 * должен видеть, что отклик уже засчитан, из любого раздела — иначе
 * после свайпа приходится идти проверять, дошло ли. Отклики, которые ждут
 * подтверждения учёбы, считаются вместе с отправленными: для студента это
 * тоже его решения.
 */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionWithRole('STUDENT');
  if (!session) redirect('/login?next=/feed');

  const store = await getStore();
  const student = await store.students.findByAccountId(session.accountId);
  // На /register уводить нельзя: middleware вернёт вошедшего обратно сюда,
  // и получится вечный круг. Сессия без профиля недействительна — снимаем
  // куку и отправляем на вход.
  if (!student) redirect('/logout?reason=stale&next=/feed');

  const [applications, skipped, unread, waiting] = await Promise.all([
    store.applications.listByStudent(student.id),
    store.swipes.listByStudent(student.id, 'LEFT'),
    countUnread({ role: 'STUDENT', profileId: student.id }),
    countWaitingApplications(student.id),
  ]);

  return (
    <AppShell
      user={{ name: studentName(student), subtitle: student.university, href: '/profile' }}
      nav={[
        { href: '/feed', label: 'Лента' },
        { href: '/applications', label: 'Отклики', badge: applications.length + waiting },
        // Значок сообщений показывает непрочитанное, а не общее число:
        // единственное, ради чего сюда заходят, — новый ответ
        { href: '/messages', label: 'Сообщения', badge: unread },
        { href: '/skipped', label: 'Пропущенные', badge: skipped.length },
        { href: '/profile', label: 'Профиль' },
      ]}
    >
      {children}
    </AppShell>
  );
}
