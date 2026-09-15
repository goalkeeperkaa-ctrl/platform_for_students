'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock3, FileText, Loader2, TriangleAlert, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { PENDING_APPLICATION_DAYS, STUDY_DOC_WORKDAYS } from '@/lib/study';
import { plural, timeAgo } from '@/lib/utils';
import type { StudyStateDTO } from '@/lib/types';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';

/**
 * Справка об обучении в профиле.
 *
 * Пока учёба не подтверждена, отклики студента ждут и не уходят
 * работодателям. Поэтому карточка говорит не «загрузите файл», а зачем:
 * сколько осталось до срока, что будет с откликами и что сказал HR, если
 * вернул справку.
 *
 * Файл уходит в два шага: загрузка на сервер и отправка на проверку. Между
 * ними справка ничья — HR видит только отправленную.
 */
export function StudyDocumentCard({ state }: { state: StudyStateDTO }) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'withdraw' | null>(null);

  async function upload(file: File) {
    setBusy('upload');
    try {
      const body = new FormData();
      body.append('kind', 'study');
      body.append('file', file);
      const uploaded = await fetch('/api/upload', { method: 'POST', body });
      const data = (await uploaded.json()) as { url?: string; name?: string; error?: string };
      if (!uploaded.ok || !data.url) throw new Error(data.error ?? 'Не удалось загрузить файл');

      const saved = await fetch('/api/students/me/study', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: data.url, name: data.name ?? file.name }),
      });
      const result = (await saved.json()) as { error?: string };
      if (!saved.ok) throw new Error(result.error ?? 'Не удалось отправить справку');

      toast.success('Справка отправлена', 'HR-менеджер проверит её и подтвердит учёбу');
      router.refresh();
    } catch (error) {
      toast.error('Справка не загрузилась', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function withdraw() {
    setBusy('withdraw');
    try {
      const response = await fetch('/api/students/me/study', { method: 'DELETE' });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Не удалось отозвать справку');
      toast.success('Справка отозвана');
      router.refresh();
    } catch (error) {
      toast.error('Не получилось', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  if (state.status === 'VERIFIED') return null;

  const deadlineText =
    state.workdaysLeft > 0
      ? `Осталось ${state.workdaysLeft} ${plural(state.workdaysLeft, 'рабочий день', 'рабочих дня', 'рабочих дней')}.`
      : state.deadlinePassed
        ? `Срок в ${STUDY_DOC_WORKDAYS} рабочих дня прошёл — загрузите справку как можно скорее.`
        : 'Сегодня последний день срока.';

  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      className="sr-only"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void upload(file);
        e.target.value = '';
      }}
    />
  );

  const uploadButton = (label: string, variant: 'accent' | 'outline') => (
    <Button
      size="sm"
      variant={variant}
      icon={busy === 'upload' ? <Loader2 className="animate-spin" /> : <Upload />}
      disabled={busy !== null}
      onClick={() => inputRef.current?.click()}
    >
      {busy === 'upload' ? 'Загружаем…' : label}
    </Button>
  );

  return (
    <div id="study" className="scroll-mt-28">
      {state.status === 'PENDING' && (
        <div className="rounded-2xl border border-accent-400/30 bg-accent-500/[0.08] p-4 text-[13.5px] leading-relaxed">
          <p className="flex items-center gap-2 font-medium text-accent-200">
            <Clock3 className="size-4 shrink-0" aria-hidden />
            Справка на проверке у HR-менеджера
          </p>
          <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-paper-dim">
            <FileText className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{state.docName ?? 'Файл'}</span>
            {state.docAt && <span className="shrink-0 text-paper-faint">· {timeAgo(state.docAt)}</span>}
          </p>
          <p className="mt-1.5 text-paper-faint">
            Как только учёбу подтвердят, ожидающие отклики уйдут работодателям.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {uploadButton('Заменить файл', 'outline')}
            <Button size="sm" variant="ghost" loading={busy === 'withdraw'} disabled={busy !== null} onClick={() => void withdraw()}>
              Отозвать
            </Button>
          </div>
        </div>
      )}

      {state.status === 'REJECTED' && (
        <div className="rounded-2xl border border-danger/35 bg-danger/[0.07] p-4 text-[13.5px] leading-relaxed">
          <p className="flex items-center gap-2 font-medium text-danger">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            HR-менеджер не принял справку
          </p>
          {state.note && <p className="mt-1.5 whitespace-pre-line break-words text-paper-dim">{state.note}</p>}
          <p className="mt-1.5 text-paper-faint">
            Загрузите новый файл. Пока учёба не подтверждена, отклики ждут; отклик, который ждёт
            дольше {PENDING_APPLICATION_DAYS} дней, удаляется.
          </p>
          <div className="mt-3">{uploadButton('Загрузить новую справку', 'accent')}</div>
        </div>
      )}

      {state.status === 'NONE' && (
        <div className="rounded-2xl border border-warn/35 bg-warn/[0.08] p-4 text-[13.5px] leading-relaxed">
          <p className="flex items-center gap-2 font-medium text-warn">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            Загрузите справку об обучении
          </p>
          <p className="mt-1.5 text-paper-dim">
            Или фото студенческого билета. {deadlineText} Пока учёба не подтверждена, отклики ждут и
            не уходят работодателям; отклик, который ждёт дольше {PENDING_APPLICATION_DAYS} дней,
            удаляется.
          </p>
          <p className="mt-1.5 text-paper-faint">PDF, JPG, PNG или WebP до 8 МБ. Файл видит только HR-менеджер и удаляет после проверки.</p>
          <div className="mt-3">{uploadButton('Загрузить справку', 'accent')}</div>
        </div>
      )}

      {picker}
    </div>
  );
}
