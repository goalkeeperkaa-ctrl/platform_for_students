'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MessagesSquare } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { Conversation, ThreadRow } from './Conversation';
import { useLiveThreads } from '@/lib/hooks/useLiveThreads';
import { durations, easeOutExpo } from '@/lib/motion';
import { cn, plural } from '@/lib/utils';
import type { MessageAuthor, MessageDTO, ThreadDTO, ThreadSummaryDTO } from '@/lib/types';

/**
 * Экран переписки: список слева, диалог справа.
 *
 * На узком экране две панели не уживаются, поэтому там показывается
 * что-то одно — список или открытый диалог. Это не «мобильная версия
 * попроще», а единственная раскладка, при которой и список читается,
 * и в реплику помещается больше трёх слов.
 */
export function ChatScreen({
  initialThreads,
  initialThread,
  viewerRole,
}: {
  initialThreads: ThreadSummaryDTO[];
  initialThread: ThreadDTO | null;
  viewerRole: MessageAuthor;
}) {
  const toast = useToast();
  const [threads, setThreads] = useState(initialThreads);
  const [thread, setThread] = useState<ThreadDTO | null>(initialThread);
  const [activeId, setActiveId] = useState<string | null>(initialThread?.applicationId ?? null);
  const [pending, setPending] = useState<MessageDTO[]>([]);
  const sequence = useRef(0);

  const refreshThreads = useCallback(async () => {
    try {
      const response = await fetch('/api/messages');
      if (!response.ok) return;
      const data = (await response.json()) as { threads: ThreadSummaryDTO[] };
      setThreads(data.threads);
    } catch {
      /* сеть моргнула — следующий проход сверит состояние */
    }
  }, []);

  const refreshThread = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/messages/${id}`);
      if (!response.ok) return;
      const data = (await response.json()) as { thread: ThreadDTO };
      setThread(data.thread);
    } catch {
      /* см. выше */
    }
  }, []);

  /** Отметка о прочтении шлётся молча: результат виден собеседнику, не нам */
  const markRead = useCallback((id: string) => {
    void fetch(`/api/messages/${id}`, { method: 'PATCH' }).catch(() => null);
  }, []);

  const open = useCallback(
    async (id: string) => {
      setActiveId(id);
      setPending([]);
      await refreshThread(id);
      markRead(id);
      // Счётчик непрочитанного меняется сразу после открытия
      void refreshThreads();
      // Ссылку на конкретный диалог можно скинуть коллеге; полноценная
      // навигация тут была бы лишней перерисовкой всего экрана
      // Путь берём текущий: у студента это /messages, у работодателя
      // /employer/messages — жёсткая строка увела бы его не туда
      window.history.replaceState(null, '', `${window.location.pathname}?thread=${id}`);
    },
    [markRead, refreshThread, refreshThreads],
  );

  // Открыли экран с уже выбранной веткой — сразу гасим непрочитанное
  useEffect(() => {
    if (initialThread && initialThread.unread > 0) {
      markRead(initialThread.applicationId);
      void refreshThreads();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLiveThreads((event) => {
    if (event.kind === 'ready') return;
    void refreshThreads();
    if (!activeId) return;
    if (event.kind === 'poll' || event.applicationId === activeId) {
      void refreshThread(activeId).then(() => {
        // Пришедшее в открытый диалог считается прочитанным сразу:
        // человек его физически видит
        if (event.kind === 'message') markRead(activeId);
      });
    }
  });

  async function send(body: string) {
    if (!activeId) return;
    const id = `pending-${++sequence.current}`;
    const optimistic: MessageDTO = {
      id,
      author: viewerRole,
      body,
      createdAt: new Date().toISOString(),
      readAt: null,
      mine: true,
    };
    // Реплика появляется мгновенно: ждать сервер ради собственного текста,
    // который уже набран, — значит превратить чат в форму
    setPending((current) => [...current, optimistic]);

    try {
      const response = await fetch(`/api/messages/${activeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Не удалось отправить');
      }
      await refreshThread(activeId);
      void refreshThreads();
    } catch (error) {
      toast.error(
        'Сообщение не отправлено',
        error instanceof Error ? error.message : 'Проверьте соединение',
      );
    } finally {
      setPending((current) => current.filter((m) => m.id !== id));
    }
  }

  const totalUnread = threads.reduce((sum, t) => sum + t.unread, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: durations.base, ease: easeOutExpo }}
      className="surface grid h-[calc(100dvh-var(--header-h)-7rem)] min-h-[30rem] grid-cols-1 overflow-hidden rounded-3xl lg:grid-cols-[22rem_minmax(0,1fr)]"
    >
      {/* ---------- список ---------- */}
      <aside
        className={cn(
          'flex min-h-0 min-w-0 flex-col border-[var(--hairline)] lg:border-r',
          activeId ? 'hidden lg:flex' : 'flex',
        )}
      >
        <div className="flex items-baseline justify-between px-4 pb-3 pt-4">
          {/* Единственный заголовок раздела — страница сама его не
              дублирует (см. app/(student)/messages/page.tsx) */}
          <h1 className="text-[19px] font-semibold tracking-[-0.015em] text-paper">Сообщения</h1>
          <span className="text-[12px] text-paper-faint">
            {totalUnread > 0
              ? `${totalUnread} ${plural(totalUnread, 'новое', 'новых', 'новых')}`
              : `${threads.length} ${plural(threads.length, 'диалог', 'диалога', 'диалогов')}`}
          </span>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {threads.length === 0 ? (
            <p className="px-3 py-10 text-center text-[13px] leading-relaxed text-paper-faint">
              Диалогов пока нет. Они появятся, когда вы откликнетесь на вакансию и работодатель
              ответит.
            </p>
          ) : (
            threads.map((t) => (
              <ThreadRow
                key={t.applicationId}
                thread={t}
                active={t.applicationId === activeId}
                viewerRole={viewerRole}
                onClick={() => void open(t.applicationId)}
              />
            ))
          )}
        </div>
      </aside>

      {/* ---------- диалог ---------- */}
      <section className={cn('min-h-0 min-w-0', activeId ? 'flex flex-col' : 'hidden lg:flex lg:flex-col')}>
        <Conversation
          thread={thread}
          pending={pending}
          onSend={send}
          onBack={() => {
            setActiveId(null);
            setThread(null);
            window.history.replaceState(null, '', window.location.pathname);
          }}
        />
      </section>
    </motion.div>
  );
}

/** Пустой экран, когда откликов ещё нет вовсе. Текст разный: студент и
 *  работодатель попадают сюда по разным причинам. */
export function ChatEmpty({
  viewerRole = 'STUDENT',
  action,
}: {
  viewerRole?: MessageAuthor;
  action?: React.ReactNode;
}) {
  return (
    <div className="surface mx-auto flex max-w-lg flex-col items-center rounded-4xl px-8 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl border border-[var(--hairline)] bg-graphite-900/50">
        <MessagesSquare className="size-6 text-paper/30" aria-hidden />
      </span>
      <h2 className="mt-7 text-display-sm text-paper">Переписки пока нет</h2>
      <p className="mt-3 max-w-[38ch] text-[14.5px] leading-relaxed text-paper-dim">
        {viewerRole === 'STUDENT'
          ? 'Диалог открывает работодатель — после того, как посмотрит ваш отклик. Смахните вправо вакансию, которая подходит, и ждите ответа здесь.'
          : 'Диалоги появятся вместе с откликами: как только студент смахнёт вашу вакансию вправо, здесь можно будет ему написать.'}
      </p>
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}
