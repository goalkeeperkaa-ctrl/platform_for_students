import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ChatEmpty, ChatScreen } from '@/components/chat/ChatScreen';
import { Button } from '@/components/ui/Button';
import { getThread, listThreads } from '@/lib/chat';
import { requireStudentPage } from '@/lib/security/guards';

export const metadata: Metadata = { title: 'Сообщения' };
export const dynamic = 'force-dynamic';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: { thread?: string };
}) {
  const { student } = await requireStudentPage('/messages');
  const viewer = { role: 'STUDENT' as const, profileId: student.id };
  const threads = await listThreads(viewer);

  if (threads.length === 0) {
    return (
      <ChatEmpty
        action={
          <Link href="/feed">
            <Button size="lg" iconRight={<ArrowRight />}>
              В ленту вакансий
            </Button>
          </Link>
        }
      />
    );
  }

  // Диалог открывается только по явной ссылке. Автовыбор первого удобен
  // на широком экране, но на телефоне выбросил бы человека сразу внутрь
  // переписки, мимо списка.
  const requested = searchParams.thread;
  const valid = requested && threads.some((t) => t.applicationId === requested) ? requested : null;
  const thread = valid ? await getThread(valid, viewer) : null;

  // Заголовок и подсказка живут внутри ChatScreen (шапка списка диалогов) —
  // отдельный заголовок страницы поверх был бы вторым «Сообщения» подряд
  return <ChatScreen initialThreads={threads} initialThread={thread} viewerRole="STUDENT" />;
}
