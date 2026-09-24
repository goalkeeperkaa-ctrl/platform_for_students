'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Logo } from '@/components/brand/Logo';
import { useToast } from '@/components/ui/Toast';
import { durations, easeOutExpo } from '@/lib/motion';

/**
 * Вход.
 *
 * Один способ на всех: студент, компания и HR-менеджер входят по почте
 * и паролю. Раньше здесь была вторая вкладка «Код из CRM» для клиентов
 * агентства без своей регистрации — теперь клиент попадает в кабинет
 * прямой ссылкой из CRM (готовая сессия, вводить нечего), а код остался
 * бы дублирующим, никому не нужным путём входа.
 */
interface DemoHint {
  student: { email: string; password: string };
  admin: { email: string; password: string };
  employerCode: string;
}

/** Почему вход из CRM не удался — человеку, который нажал кнопку в CRM. */
const CRM_LOGIN_MESSAGES: Record<string, string> = {
  expired: 'Ссылка входа из CRM устарела или повреждена. Нажмите «Открыть студенческую платформу» в CRM ещё раз.',
  used: 'Эта ссылка входа уже использована. Нажмите кнопку в CRM ещё раз.',
  conflict: 'Эта почта уже занята учётной записью студента или компании. Попросите владельца указать сотруднику другую почту в CRM.',
  disabled: 'Доступ к панели отключён. Обратитесь к владельцу агентства.',
  config: 'Вход из CRM не настроен: нужен STUDENTS_SSO_SECRET — тот же, что в CRM.',
};

export function LoginForm({ demoHint }: { demoHint?: DemoHint }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(endpoint: string, payload: Record<string, string>) {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { redirectTo?: string; error?: string };

      if (!response.ok) {
        setError(data.error ?? 'Не удалось войти');
        return;
      }

      // «next» из middleware: вернуть человека туда, куда он шёл
      const next = params.get('next');
      router.push(next && next.startsWith('/') ? next : (data.redirectTo ?? '/'));
      router.refresh();
    } catch {
      toast.error('Сеть недоступна', 'Проверьте соединение и попробуйте ещё раз');
    } finally {
      setPending(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    return signIn('/api/auth/login', { email, password });
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-16">
      <motion.div
        initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: durations.slow, ease: easeOutExpo }}
        className="w-full max-w-[26rem]"
      >
        <div className="mb-9 flex justify-center">
          <Logo />
        </div>
        {/* Заголовка на экране нет — его роль играет логотип. Экранному
            диктору без h1 не за что зацепиться: страница звучит как набор
            полей без названия. */}
        <h1 className="sr-only">Вход в Fattakhov HR Agency</h1>

        {/* Пришли с /logout?reason=stale: сессия ссылалась на аккаунт,
            которого больше нет. Без пояснения человек видит форму входа
            без причины и решает, что его выкинуло просто так. */}
        {params.get('crm') && (
          <div className="mb-4 rounded-2xl border border-warn/35 bg-warn/[0.08] p-4 text-[13px] leading-relaxed text-warn">
            {CRM_LOGIN_MESSAGES[params.get('crm') ?? ''] ?? CRM_LOGIN_MESSAGES.expired}
          </div>
        )}
        {params.get('reset') === '1' && (
          <div className="mb-4 rounded-2xl border border-yes/30 bg-yes/[0.08] p-4 text-[13px] leading-relaxed text-paper">
            Пароль изменён — войдите с новым.
          </div>
        )}
        {params.get('reason') === 'stale' && (
          <div className="mb-4 rounded-2xl border border-warn/35 bg-warn/[0.08] p-4 text-[13px] leading-relaxed text-warn">
            Сессия устарела — данные аккаунта изменились на сервере. Войдите заново.
          </div>
        )}

        <div className="glass rounded-3xl p-6 sm:p-8">
          <form onSubmit={submit}>
            <div className="space-y-3">
              <TextField
                label="Почта"
                type="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <TextField
                label="Пароль"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="flex justify-end">
                <Link
                  href="/forgot"
                  className="text-[12.5px] text-paper-faint underline-offset-4 transition-colors hover:text-paper hover:underline"
                >
                  Забыли пароль?
                </Link>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0, y: -6 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -6 }}
                  transition={{ duration: durations.fast, ease: easeOutExpo }}
                  className="overflow-hidden pt-3 text-[13px] leading-snug text-danger"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <Button type="submit" size="lg" loading={pending} className="mt-5 w-full" iconRight={<ArrowRight />}>
              Войти
            </Button>
          </form>

          {/* Демо-вход одной кнопкой, а не списком паролей для перепечатки:
              скопированный из подсказки пароль тянет за собой пробел, и
              человек видит «неверная почта или пароль» при верных данных.
              Показывать сами доступы всё равно полезно — но вводить их
              вручную больше не нужно. */}
          {demoHint && (
            <div className="mt-6 rounded-2xl border border-[var(--hairline)] bg-graphite-950/50 p-4">
              <p className="text-[12px] text-paper/70">Демо-режим — войти одним нажатием</p>
              <div className="mt-3 grid gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => signIn('/api/auth/login', demoHint.student)}
                >
                  Студент — Алиса Ковалёва
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => signIn('/api/auth/employer', { code: demoHint.employerCode })}
                >
                  Работодатель — Кофейни «Север»
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => signIn('/api/auth/login', demoHint.admin)}
                >
                  HR-менеджер агентства
                </Button>
              </div>
              <div className="mt-3 space-y-1 text-[11.5px] leading-relaxed text-paper-faint">
                <p>
                  Студент: <code className="text-accent-200">{demoHint.student.email}</code> ·{' '}
                  <code className="text-accent-200">{demoHint.student.password}</code>
                </p>
                <p>
                  HR-менеджер: <code className="text-accent-200">{demoHint.admin.email}</code> ·{' '}
                  <code className="text-accent-200">{demoHint.admin.password}</code>
                </p>
                <p>
                  Код работодателя: <code className="text-accent-200">{demoHint.employerCode}</code>
                </p>
                <p className="pt-1">Данные живут до перезапуска сервера.</p>
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-[13px] text-paper-faint">
          Ещё нет профиля?{' '}
          <Link href="/register" className="text-paper underline-offset-4 transition-colors hover:underline">
            Регистрация студента
          </Link>
        </p>
        <p className="mt-1.5 text-center text-[13px] text-paper-faint">
          Вы работодатель?{' '}
          <Link href="/register/company" className="text-paper underline-offset-4 transition-colors hover:underline">
            Зарегистрировать компанию
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
