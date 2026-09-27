import { redirect } from 'next/navigation';
import { History, Inbox, Layers, MessageCircle } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { countUnread } from '@/lib/chat';
import { getStore } from '@/lib/db';
import { studentName } from '@/lib/db/mappers';
import { getSessionWithRole } from '@/lib/security/guards';
import { listWaitingSwipes } from '@/lib/services';

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

  const [applications, skipped, unread, waitingSwipes] = await Promise.all([
    store.applications.listByStudent(student.id),
    store.swipes.listByStudent(student.id, 'LEFT'),
    countUnread({ role: 'STUDENT', profileId: student.id }),
    listWaitingSwipes(student.id),
  ]);

  // Новое во «Откликах» с прошлого захода — не общее число, оно иначе
  // никогда не убывало бы после просмотра (студент один раз откроет
  // вкладку, а счётчик так и будет висеть с тем же числом годами).
  const viewedAt = student.applicationsViewedAt;
  const newApplications = viewedAt
    ? applications.filter((a) => a.createdAt > viewedAt || a.statusChangedAt > viewedAt).length
    : applications.length;
  const newWaiting = viewedAt ? waitingSwipes.filter((s) => s.createdAt > viewedAt).length : waitingSwipes.length;

  return (
    <AppShell
      user={{ name: studentName(student), subtitle: student.university, href: '/profile' }}
      nav={[
        // Все вкладки — иконками: с текстом разной длины подложка активной
        // вкладки при переезде между ними меняла ширину, дёргаясь. «Профиль»
        // здесь нет — в него ведёт аватар в шапке.
        { href: '/feed', label: 'Лента', icon: <Layers className="size-[18px]" aria-hidden />, hideLabel: true },
        {
          href: '/applications',
          label: 'Отклики',
          badge: newApplications + newWaiting,
          icon: <Inbox className="size-[18px]" aria-hidden />,
          hideLabel: true,
        },
        // Значок сообщений показывает непрочитанное, а не общее число:
        // единственное, ради чего сюда заходят, — новый ответ
        {
          href: '/messages',
          label: 'Сообщения',
          badge: unread,
          icon: <MessageCircle className="size-[18px]" aria-hidden />,
          hideLabel: true,
        },
        {
          href: '/skipped',
          label: 'Пропущенные',
          badge: skipped.length,
          icon: <History className="size-[18px]" aria-hidden />,
          hideLabel: true,
        },
      ]}
    >
      {children}
    </AppShell>
  );
}
