'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Link2Off } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { durations, easeOutExpo } from '@/lib/motion';

/**
 * Новый пароль по ссылке из письма.
 *
 * Устаревшую ссылку страница показывает сразу, до ввода пароля: иначе
 * человек придумывает пароль, дважды его набирает — и только потом узнаёт,
 * что всё зря.
 */
export function ResetPasswordForm({ token, state }: { token: string; state: 'VALID' | 'INVALID' | 'EXPIRED' }) {
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState<{ password?: string; repeat?: string; form?: string }>({});
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== repeat) {
      setErrors({ repeat: 'Пароли не совпадают' });
      return;
    }
    setPending(true);
    setErrors({});
    try {
      const response = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
        redirectTo?: string;
      };
      if (!response.ok) {
        setErrors(
          data.fields?.password
            ? { password: data.fields.password }
            : { form: data.error ?? 'Не удалось сменить пароль' },
        );
        return;
      }
      toast.success('Пароль изменён', 'Войдите с новым паролем');
      router.push(data.redirectTo ?? '/login?reset=1');
    } catch {
      toast.error('Сеть недоступна', 'Проверьте соединение и попробуйте ещё раз');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-16">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: durations.slow, ease: easeOutExpo }}
        className="w-full max-w-[26rem]"
      >
        <div className="mb-9 flex justify-center">
          <Logo />
        </div>

        <div className="glass rounded-3xl p-6 sm:p-8">
          {state === 'VALID' ? (
            <>
              <h1 className="text-[20px] font-semibold text-paper">Новый пароль</h1>
              <form onSubmit={submit} className="mt-4 space-y-3">
                <TextField
                  label="Новый пароль"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  error={errors.password}
                  hint="Не короче 8 символов"
                  onChange={(e) => setPassword(e.target.value)}
                />
                <TextField
                  label="Повторите пароль"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={repeat}
                  error={errors.repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                />
                {errors.form && (
                  <p role="alert" className="text-[13px] leading-snug text-danger">
                    {errors.form}
                  </p>
                )}
                <Button type="submit" size="lg" loading={pending} className="mt-2 w-full" iconRight={<ArrowRight />}>
                  Сохранить пароль
                </Button>
              </form>
            </>
          ) : (
            <div className="space-y-4">
              <h1 className="flex items-center gap-2.5 text-[20px] font-semibold text-paper">
                <Link2Off className="size-5 shrink-0 text-warn" aria-hidden />
                Ссылка не работает
              </h1>
              <p className="text-[14px] leading-relaxed text-paper-dim">
                {state === 'EXPIRED'
                  ? 'Ссылка устарела — она работает час после письма.'
                  : 'Ссылка неполная или уже использована. Каждая ссылка срабатывает один раз.'}
              </p>
              <Link href="/forgot" className="block">
                <Button size="lg" className="w-full" iconRight={<ArrowRight />}>
                  Запросить новую ссылку
                </Button>
              </Link>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-[13px] text-paper-faint">
          <Link href="/login" className="text-paper underline-offset-4 transition-colors hover:underline">
            Вернуться ко входу
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
