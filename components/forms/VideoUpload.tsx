'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Upload, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { durations, easeOutExpo, springSoft } from '@/lib/motion';
import { cn } from '@/lib/utils';

const MIME = ['video/mp4', 'video/webm'];
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Загрузка видеофайла (компания, вакансия, видео-визитка студента).
 *
 * Файл льётся напрямую в S3 по подписанной ссылке, а не через наш
 * сервер: на Vercel у функций жёсткий лимит тела запроса в 4.5 МБ, а
 * видео тут — до 50. Без S3 (разработка) сервер откажет в подписанной
 * ссылке, и тогда файл уходит обычным POST'ом на /api/upload, как фото
 * и резюме, — для локальной разработки это уже работает.
 */
export function VideoUpload({
  value,
  onChange,
  kind,
}: {
  value: string;
  onChange: (url: string) => void;
  kind: 'companyVideo' | 'studentVideo';
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const isUploadedFile = value.startsWith(`/api/files/${kind}/`);

  async function upload(file: File) {
    if (!MIME.includes(file.type)) {
      toast.error('Неподходящий формат', 'Нужен MP4 или WebM');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Файл слишком большой', 'Максимум 50 МБ');
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const signResponse = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, mime: file.type, size: file.size }),
      });
      const signData = (await signResponse.json()) as {
        uploadUrl?: string;
        url?: string;
        error?: string;
        code?: string;
      };

      if (signResponse.ok && signData.uploadUrl && signData.url) {
        await putWithProgress(signData.uploadUrl, file, setProgress);
        onChange(signData.url);
        return;
      }

      // Нет S3 (локальная разработка) — обычная загрузка через наш сервер
      if (signData.code === 'NO_S3') {
        const body = new FormData();
        body.append('kind', kind);
        body.append('file', file);
        const response = await fetch('/api/upload', { method: 'POST', body });
        const data = (await response.json()) as { url?: string; error?: string };
        if (!response.ok || !data.url) throw new Error(data.error ?? 'Не удалось загрузить');
        onChange(data.url);
        return;
      }

      throw new Error(signData.error ?? 'Не удалось загрузить видео');
    } catch (error) {
      toast.error('Видео не загрузилось', error instanceof Error ? error.message : undefined);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <AnimatePresence mode="wait" initial={false}>
        {isUploadedFile ? (
          <motion.div
            key="file"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: durations.fast, ease: easeOutExpo }}
            className="space-y-3"
          >
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- превью для формы, не публичный плеер */}
            <video src={value} controls className="w-full max-w-xs rounded-2xl border border-[var(--hairline)]" />
            <button
              type="button"
              onClick={() => onChange('')}
              className="flex items-center gap-2 text-[13px] text-paper-faint transition-colors hover:text-danger"
            >
              <X className="size-4" />
              Удалить видео
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="empty"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springSoft}
            className={cn(
              'flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-paper/15 bg-graphite-900/40 p-4 text-left transition-colors duration-300 hover:border-paper/28',
            )}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper/[0.06] text-paper/50">
              {uploading ? <Loader2 className="size-4.5 animate-spin" /> : <Upload className="size-4.5" />}
            </span>
            <div>
              <p className="text-[14px] font-medium text-paper/85">
                {uploading ? `Загружаем… ${progress}%` : 'Загрузить видеофайл'}
              </p>
              <p className="text-[12px] text-paper-faint">MP4 или WebM до 50 МБ</p>
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('Хранилище отклонило файл'));
    };
    xhr.onerror = () => reject(new Error('Сеть прервалась во время загрузки'));
    xhr.send(file);
  });
}
