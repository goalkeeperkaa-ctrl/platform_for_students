'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

const COPY = {
  student:
    'Срок загрузки справки, отклики, которые скоро удалятся, и новые сообщения. Письма о решениях HR-менеджера и работодателей приходят всегда.',
  company:
    'Сводка о новых сообщениях от студентов. Письма о проверке компании и вакансий и о новых откликах приходят всегда.',
};

/**
 * Напоминания и сводки на почту — переключатель.
 *
 * Состояние грузится само: форме профиля и странице компании не нужно ради
 * одного флажка тянуть ещё одно поле через сервер.
 */
export function NotificationToggle({
  audience,
  bordered = true,
}: {
  audience: 'student' | 'company';
  bordered?: boolean;
}) {
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account/notifications', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<{ email?: boolean }>) : null))
      .then((data) => {
        if (!cancelled && typeof data?.email === 'boolean') setEnabled(data.email);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    if (enabled === null) return;
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      const response = await fetch('/api/account/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: next }),
      });
      if (!response.ok) throw new Error();
      toast.success(
        next ? 'Напоминания включены' : 'Напоминания отключены',
        next ? 'Будут приходить на почту' : 'Письма о решениях по-прежнему придут',
      );
    } catch {
      setEnabled(!next);
      toast.error('Не удалось сохранить', 'Попробуйте ещё раз');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn('flex items-start justify-between gap-4', bordered && 'border-t border-[var(--hairline)] pt-4')}>
      <div className="min-w-0">
        <p id={`notify-email-${audience}`} className="text-[13.5px] text-paper">
          Напоминания на почту
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-paper-faint">{COPY[audience]}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled === true}
        aria-labelledby={`notify-email-${audience}`}
        disabled={enabled === null || saving}
        onClick={() => void toggle()}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50',
          enabled ? 'border-accent-300/60 bg-accent-500' : 'border-[var(--hairline-strong)] bg-paper/10',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'inline-block size-4 rounded-full bg-paper shadow transition-transform',
            enabled ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  );
}
