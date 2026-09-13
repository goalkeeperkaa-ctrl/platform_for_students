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
    <AppShell user={{ name: employer.companyName, subtitle: employer.contactName }} nav={nav}>
      {threads.length === 0 ? (
        <ChatEmpty viewerRole="EMPLOYER" />
      ) : (
        <>
          <header className="mb-6">
            <h1 className="text-display-md text-paper">Сообщения</h1>
            <p className="mt-2.5 text-[14.5px] text-paper-dim">
              Диалог заводите вы: студент сможет ответить, как только вы напишете первым или
              измените статус его отклика.
            </p>
          </header>
          <ChatScreen initialThreads={threads} initialThread={thread} viewerRole="EMPLOYER" />
        </>
      )}
    </AppShell>
  );
}
