'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { ApplicationStatusPill } from '@/components/ui/StatusPill';
import { Composer, ComposerLocked } from './Composer';
import { DaySeparator, MessageBubble } from './MessageBubble';
import { durations, easeOutExpo } from '@/lib/motion';
import { cn, dayLabel, formatDate, isSameBurst } from '@/lib/utils';
import { APPLICATION_STATUS_LABEL, type ApplicationStatus, type MessageDTO, type ThreadDTO } from '@/lib/types';

/**
 * Цвет статуса в превью строки списка — тот же смысл, что у
 * ApplicationStatusPill (components/ui/StatusPill.tsx), но без рамки и
 * заливки: здесь это строка текста на месте последнего сообщения,
 * а не отдельный значок.
 */
const STATUS_PREVIEW_TONE: Record<ApplicationStatus, string> = {
  NEW: 'text-accent-200',
  VIEWED: 'text-paper/70',
  INVITED: 'text-warn',
  INTERVIEW: 'text-warn',
  HIRED: 'text-yes-glow',
  REJECTED: 'text-paper-faint',
};

/**
 * Одна переписка.
 *
 * Прокрутка сама уезжает вниз на новое сообщение, но только если человек
 * и так был внизу: утащить его от места, где он читает старое, — верный
 * способ разозлить.
 */
export function Conversation({
  thread,
  pending,
  onSend,
  onBack,
}: {
  thread: ThreadDTO | null;
  pending: MessageDTO[];
  onSend: (body: string) => void;
  onBack?: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const count = (thread?.messages.length ?? 0) + pending.length;

  useEffect(() => {
    const node = scroller.current;
    if (!node || !stickToBottom.current) return;
    node.scrollTop = node.scrollHeight;
  }, [count, thread?.applicationId]);

  // Открыли другую ветку — всегда показываем последнее
  useEffect(() => {
    stickToBottom.current = true;
  }, [thread?.applicationId]);

  if (!thread) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <span className="grid size-14 place-items-center rounded-2xl border border-[var(--hairline)] bg-graphite-900/50">
          <MessageSquare className="size-6 text-paper/30" aria-hidden />
        </span>
        {/* Формулировка нейтральная: этот экран видят обе стороны */}
        <p className="max-w-[30ch] text-[14px] leading-relaxed text-paper-dim">
          Выберите диалог слева. Переписка ведётся по каждому отклику отдельно — по конкретной
          вакансии.
        </p>
      </div>
    );
  }

  const all = [...thread.messages, ...pending];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-[var(--hairline)] bg-ink/70 px-4 py-3 backdrop-blur-glass sm:px-5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="К списку диалогов"
            className="-ml-1 grid size-9 shrink-0 place-items-center rounded-xl text-paper/60 transition-colors hover:bg-paper/[0.06] hover:text-paper lg:hidden"
          >
            <ArrowLeft className="size-4.5" />
          </button>
        )}
        <Avatar name={thread.counterpartName} src={thread.counterpartPhotoUrl} size={40} rounded="square" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-medium text-paper">{thread.counterpartName}</p>
          <p className="truncate text-[12.5px] text-paper-faint">
            {thread.vacancyTitle} · {thread.counterpartSubtitle}
          </p>
        </div>
        <ApplicationStatusPill status={thread.status} className="shrink-0" />
      </header>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5"
      >
        {all.length === 0 ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.base, ease: easeOutExpo }}
            className="mx-auto mt-16 max-w-[34ch] text-center text-[13.5px] leading-relaxed text-paper-faint"
          >
            Сообщений пока нет. Здесь появится переписка по вакансии «{thread.vacancyTitle}».
          </motion.p>
        ) : (
          <AnimatePresence initial={false}>
            {all.map((message, index) => {
              const previous = all[index - 1];
              const next = all[index + 1];
              const grouped = isSameBurst(previous, message);
              const showDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
              return (
                <div key={message.id}>
                  {showDay && <DaySeparator label={dayLabel(message.createdAt)} />}
                  <MessageBubble
                    message={message}
                    grouped={grouped && !showDay}
                    lastInBurst={!next || !isSameBurst(message, next)}
                    pending={message.id.startsWith('pending-')}
                  />
                </div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {thread.canWrite ? (
        <Composer onSend={onSend} />
      ) : (
        <ComposerLocked reason={thread.lockedReason ?? 'Переписка недоступна'} />
      )}
    </div>
  );
}

/** Сегодня — время, раньше — короткая дата: как читает любой мессенджер. */
function threadStamp(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay
    ? new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date)
    : formatDate(date);
}

/** Строка списка диалогов. */
export function ThreadRow({
  thread,
  active,
  onClick,
}: {
  thread: {
    applicationId: string;
    counterpartName: string;
    counterpartPhotoUrl: string | null;
    vacancyTitle: string;
    status: ApplicationStatus;
    lastMessageBody: string | null;
    lastMessageAuthor: 'STUDENT' | 'EMPLOYER' | null;
    lastMessageAt: string | null;
    unread: number;
  };
  active: boolean;
  onClick: () => void;
  viewerRole: 'STUDENT' | 'EMPLOYER';
}) {
  // Переписки ещё не было — вместо пустой строки показываем, на каком
  // этапе отклик: то же самое hh.ru делает в списке диалогов. NEW не
  // показываем — это «ещё не открыли», а не событие, о котором стоит
  // сообщить.
  const preview = thread.lastMessageBody ?? (thread.status !== 'NEW' ? APPLICATION_STATUS_LABEL[thread.status] : null);
  const previewTone = thread.lastMessageBody
    ? thread.unread > 0
      ? 'text-paper/85'
      : 'text-paper-dim'
    : STATUS_PREVIEW_TONE[thread.status];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors duration-300',
        active
          ? 'border-[var(--hairline-strong)] bg-paper/[0.07]'
          : 'border-transparent hover:bg-paper/[0.035]',
      )}
    >
      <Avatar
        name={thread.counterpartName}
        src={thread.counterpartPhotoUrl}
        size={44}
        rounded="square"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[14px] font-medium text-paper">{thread.counterpartName}</p>
          {thread.lastMessageAt && (
            <span className="shrink-0 text-[11px] tabular-nums text-paper-faint">
              {threadStamp(thread.lastMessageAt)}
            </span>
          )}
        </div>
        <p className="truncate text-[12px] text-paper-faint">{thread.vacancyTitle}</p>
        <p className={cn('mt-0.5 truncate text-[12.5px]', previewTone)}>
          {preview ?? 'Переписки ещё не было'}
        </p>
      </div>
      {thread.unread > 0 && (
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-500 text-[10.5px] font-medium tabular-nums text-paper">
          {thread.unread}
        </span>
      )}
    </button>
  );
}
