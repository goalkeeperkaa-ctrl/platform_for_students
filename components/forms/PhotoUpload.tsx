'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Loader2, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { springSoft, durations, easeOutExpo } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Загрузка фотографии.
 *
 * Превью появляется мгновенно из локального файла, не дожидаясь сервера:
 * человек должен увидеть, что попало в форму, до того как узнает, что
 * оно долетело. Ссылка с сервера подставляется молча, когда придёт.
 */
export function PhotoUpload({
  value,
  onChange,
  kind = 'photo',
  name,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  /** Вид файла: фото студента или изображение компании (раздаётся публично) */
  kind?: 'photo' | 'company';
  name: string;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // objectURL держит файл в памяти, пока его не отозвать
  useEffect(() => () => {
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
  }, [preview]);

  const upload = useCallback(
    async (file: File) => {
      const local = URL.createObjectURL(file);
      setPreview(local);
      setUploading(true);

      try {
        const body = new FormData();
        body.append('kind', kind);
        body.append('file', file);
        const response = await fetch('/api/upload', { method: 'POST', body });
        const data = (await response.json()) as { url?: string; error?: string };
        if (!response.ok || !data.url) throw new Error(data.error ?? 'Не удалось загрузить');
        onChange(data.url);
      } catch (error) {
        setPreview(null);
        onChange(null);
        toast.error('Фото не загрузилось', error instanceof Error ? error.message : undefined);
      } finally {
        setUploading(false);
      }
    },
    [kind, onChange, toast],
  );

  const shown = preview ?? value;

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void upload(file);
        }}
        animate={{ scale: dragOver ? 1.04 : 1 }}
        transition={springSoft}
        className={cn(
          'relative size-40 overflow-hidden rounded-4xl border-2 border-dashed transition-colors duration-300',
          dragOver
            ? 'border-accent-400 bg-accent-500/10'
            : shown
              ? 'border-transparent'
              : 'border-paper/15 bg-graphite-900/50 hover:border-paper/30',
        )}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="group absolute inset-0 grid place-items-center"
          aria-label={shown ? 'Заменить фотографию' : 'Загрузить фотографию'}
        >
          <AnimatePresence mode="wait">
            {shown ? (
              <motion.span
                key="preview"
                initial={{ opacity: 0, scale: 1.06 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: durations.base, ease: easeOutExpo }}
                className="absolute inset-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- blob или защищённый роут, оптимизатор к ним не ходит */}
                <img src={shown} alt={name} className="size-full object-cover" />
                <span className="absolute inset-0 bg-ink/0 transition-colors duration-300 group-hover:bg-ink/45" />
                <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <Camera className="size-6 text-paper" />
                </span>
              </motion.span>
            ) : (
              <motion.span
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-2 px-4 text-center"
              >
                <Camera className="size-6 text-paper/40" />
                <span className="text-[12.5px] leading-snug text-paper-faint">
                  Перетащите фото
                  <br />
                  или нажмите
                </span>
              </motion.span>
            )}
          </AnimatePresence>

          {uploading && (
            <span className="absolute inset-0 grid place-items-center bg-ink/65 backdrop-blur-sm">
              <Loader2 className="size-6 animate-spin text-paper" />
            </span>
          )}
        </button>

        {shown && !uploading && (
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              onChange(null);
            }}
            aria-label="Удалить фотографию"
            className="absolute right-2 top-2 rounded-full bg-ink/75 p-1.5 text-paper/80 backdrop-blur transition-colors hover:bg-ink hover:text-paper"
          >
            <X className="size-3.5" />
          </button>
        )}
      </motion.div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />

      <p className="text-center text-[12.5px] leading-snug text-paper-faint">
        JPG, PNG или WebP до 5 МБ.{' '}
        {kind === 'company'
          ? 'Студенты увидят после одобрения агентством.'
          : 'Фото видят только те работодатели, которым вы откликнулись.'}
        <br className="hidden sm:block" />
      </p>
    </div>
  );
}
