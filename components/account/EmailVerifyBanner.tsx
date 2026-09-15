'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { EMAIL_CODE_LENGTH, normalizeCode } from '@/lib/account-codes';

/**
 * «Подтвердите почту» — код из письма прямо в кабинете.
 *
 * Не отдельный экран и не блокировка: человек смотрит ленту или готовит
 * страницу компании, а код вводит, когда дойдёт до почты. Действия, для
 * которых подтверждение нужно, говорят об этом сами.
 */
export function EmailVerifyBanner({ email }: { email: string }) {
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setVerifying(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; released?: number };
      if (!response.ok) {
        setError(data.error ?? 'Не удалось проверить код');
        return;
      }
      toast.success(
        'Почта подтверждена',
        data.released ? `Отклики отправлены работодателям: ${data.released}` : 'Спасибо — адрес проверен',
      );
      router.refresh();
    } catch {
      toast.error('Сеть недоступна', 'Проверьте соединение и попробуйте ещё раз');
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/email', { method: 'POST' });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        retryAfter?: number;
        delivered?: boolean;
        verified?: boolean;
      };
      if (data.verified) {
        router.refresh();
        return;
      }
      if (!response.ok) {
        setError(data.error ?? 'Не удалось отправить код');
        const retry = Number(data.retryAfter ?? response.headers.get('Retry-After'));
        if (retry > 0) setWait(retry);
        return;
      }
      setWait(data.retryAfter ?? 60);
      if (data.delivered === false) {
        toast.error('Письмо не отправилось', 'Попробуйте ещё раз через минуту');
      } else {
        toast.success('Код отправлен', `Проверьте ${email} — и папку «Спам»`);
      }
    } catch {
      toast.error('Сеть недоступна', 'Проверьте соединение и попробуйте ещё раз');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-warn/35 bg-warn/[0.08] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-paper">Подтвердите почту</p>
          <p className="mt-1 text-[13px] leading-relaxed text-paper-dim">
            Код отправлен на {email}. Пока почта не подтверждена, отклики ждут, а вакансии не уходят на проверку.
          </p>
          <form onSubmit={verify} className="mt-3 flex flex-wrap items-center gap-2">
            <input
              id="email-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Код из письма"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value).slice(0, EMAIL_CODE_LENGTH))}
              className="h-10 w-[9.5rem] rounded-xl border border-[var(--hairline-strong)] bg-graphite-950/60 px-3 text-center font-mono text-[16px] tracking-[0.3em] text-paper outline-none transition-colors placeholder:text-paper-faint focus:border-accent-300"
            />
            <Button type="submit" size="sm" loading={verifying} disabled={code.length !== EMAIL_CODE_LENGTH}>
              Подтвердить
            </Button>
            <Button type="button" variant="ghost" size="sm" loading={sending} disabled={wait > 0} onClick={() => void resend()}>
              {wait > 0 ? `Отправить снова через ${wait} с` : 'Отправить код ещё раз'}
            </Button>
          </form>
          {error && (
            <p role="alert" className="mt-2 text-[12.5px] leading-snug text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
