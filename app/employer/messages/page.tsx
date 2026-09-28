import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/AppShell';
import { ChatEmpty, ChatScreen } from '@/components/chat/ChatScreen';
import { countUnread, getThread, listThreads } from '@/lib/chat';
import { requireEmployerPage } from '@/lib/security/guards';
import { employerNav } from '@/lib/employer-nav';
import { buildEmployerBoard } from '@/lib/services';

export const metadata: Metadata = { title: 'Сообщения · кабинет работодателя' };
export const dynamic = 'force-dynamic';

export default async function EmployerMessagesPage({
  searchParams,
}: {
  searchParams: { thread?: string };
}) {
  const { employer } = await requireEmployerPage('/employer/messages');
  const viewer = { role: 'EMPLOYER' as const, profileId: employer.id };

  const [threads, board, unread] = await Promise.all([
    listThreads(viewer),
    buildEmployerBoard(employer.id),
    countUnread(viewer),
  ]);

  const nav = employerNav(board.applications.length, unread);

  const requested = searchParams.thread;
  const valid = requested && threads.some((t) => t.applicationId === requested) ? requested : null;
  const thread = valid ? await getThread(valid, viewer) : null;

  return (
    <AppShell
      user={{ name: employer.companyName, subtitle: employer.contactName, href: '/employer/company' }}
      nav={nav}
    >
      {threads.length === 0 ? (
        <ChatEmpty viewerRole="EMPLOYER" />
      ) : (
        // Заголовок и подсказка живут внутри ChatScreen (шапка списка
        // диалогов) — отдельный заголовок страницы поверх был бы вторым
        // «Сообщения» подряд
        <ChatScreen initialThreads={threads} initialThread={thread} viewerRole="EMPLOYER" />
      )}
    </AppShell>
  );
}
