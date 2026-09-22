'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { EMAIL_CODE_LENGTH, normalizeCode } from '@/lib/account-codes';
import { durations, easeOutExpo } from '@/lib/motion';

interface ConfirmResponse {
  error?: string;
  code?: string;
  pending?: string;
  redirectTo?: string;
  moderationStatus?: string;
}

/**
 * Код из письма — последний шаг регистрации, до того как появится
 * учётная запись. Не банер в кабинете, а сам шаг: аккаунта ещё нет,
 * кабинета, где банер мог бы жить, тоже.
 */
export function ConfirmCodeStep({
  email,
  pending,
  confirmUrl,
  resendUrl,
  onVerified,
  onRestart,
}: {
  email: string;
  pending: string;
  confirmUrl: string;
  resendUrl: string;
  onVerified: (data: ConfirmResponse) => void;
  /** Билет истёк или заблокирован — форму нужно заполнять заново. */
  onRestart: () => void;
}) {
  const toast = useToast();
  const [token, setToken] = useState(pending);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [wait, setWait] = useState(60);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setVerifying(true);
    setError(null);
    try {
      const response = await fetch(confirmUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pending: token, code }),
      });
      const data = (await response.json().catch(() => ({}))) as ConfirmResponse;
      if (!response.ok || data.error) {
        if (data.pending) setToken(data.pending);
        setCode('');
        if (data.code === 'CODE_EXPIRED' || data.code === 'CODE_LOCKED') {
          toast.error(data.error ?? 'Начните регистрацию заново');
          onRestart();
          return;
        }
        setError(data.error ?? 'Не удалось проверить код');
        return;
      }
      onVerified(data);
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
      const response = await fetch(resendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pending: token }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        pending?: string;
        delivered?: boolean;
        retryAfter?: number;
      };
      if (!response.ok) {
        if (data.code === 'CODE_EXPIRED') {
          toast.error(data.error ?? 'Начните регистрацию заново');
          onRestart();
          return;
        }
        setError(data.error ?? 'Не удалось отправить код');
        const retry = Number(data.retryAfter);
        if (retry > 0) setWait(retry);
        return;
      }
      if (data.pending) setToken(data.pending);
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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: durations.base, ease: easeOutExpo }}
      className="mx-auto w-full max-w-[26rem] text-center"
    >
      <MailCheck className="mx-auto size-9 text-accent-300" aria-hidden />
      <h1 className="mt-5 text-display-sm text-paper">Подтвердите почту</h1>
      <p className="mt-2.5 text-[14.5px] leading-relaxed text-paper-dim">
        Код отправлен на {email}. Введите его, чтобы открыть аккаунт.
      </p>

      <form onSubmit={verify} className="mt-7 flex flex-col items-center gap-4">
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          aria-label="Код из письма"
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(normalizeCode(e.target.value).slice(0, EMAIL_CODE_LENGTH))}
          className="h-14 w-48 rounded-2xl border border-[var(--hairline-strong)] bg-graphite-950/60 text-center font-mono text-[22px] tracking-[0.4em] text-paper outline-none transition-colors placeholder:text-paper-faint focus:border-accent-300"
        />
        {error && (
          <p role="alert" className="text-[12.5px] leading-snug text-danger">
            {error}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          loading={verifying}
          disabled={code.length !== EMAIL_CODE_LENGTH}
          className="w-full"
        >
          Подтвердить и продолжить
        </Button>
        <Button type="button" variant="ghost" size="sm" loading={sending} disabled={wait > 0} onClick={() => void resend()}>
          {wait > 0 ? `Отправить снова через ${wait} с` : 'Отправить код ещё раз'}
        </Button>
      </form>

      <button
        type="button"
        onClick={onRestart}
        className="mt-6 text-[12.5px] text-paper-faint underline-offset-4 transition-colors hover:text-paper hover:underline"
      >
        Неверная почта? Начать заново
      </button>
    </motion.div>
  );
}
