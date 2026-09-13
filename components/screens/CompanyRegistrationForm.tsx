'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { companyRegistrationSchema } from '@/lib/company';
import { durations, easeOutExpo, springSnappy } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface FormState {
  companyName: string;
  contactName: string;
  email: string;
  password: string;
  industry: string;
  city: string;
  consent: boolean;
}

const INITIAL: FormState = {
  companyName: '',
  contactName: '',
  email: '',
  password: '',
  industry: '',
  city: '',
  consent: false,
};

/**
 * Регистрация компании.
 *
 * Одна короткая форма, а не мастер: у компании на входе нужно ровно то,
 * без чего нельзя завести кабинет. Страницу компании — описание, фото,
 * культуру — заполняют уже внутри, спокойно, а не на пороге.
 *
 * Сразу говорим про модерацию: компания, которая узнаёт о проверке только
 * после того, как оформила вакансию, чувствует себя обманутой.
 */
export function CompanyRegistrationForm() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  function patch(values: Partial<FormState>) {
    setForm((current) => ({ ...current, ...values }));
    setErrors((current) => {
      if (Object.keys(current).length === 0) return current;
      const next = { ...current };
      for (const key of Object.keys(values)) delete next[key];
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = { ...form, industry: form.industry || null, city: form.city || null };

    const parsed = companyRegistrationSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setPending(true);
    try {
      const response = await fetch('/api/auth/register/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        redirectTo?: string;
        error?: string;
        fields?: Record<string, string>;
      };
      if (!response.ok) {
        if (data.fields) setErrors(data.fields);
        toast.error(data.error ?? 'Не удалось зарегистрировать компанию');
        return;
      }
      router.push(data.redirectTo ?? '/employer/company');
      router.refresh();
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
        className="w-full max-w-[28rem]"
      >
        <div className="mb-9 flex justify-center">
          <Logo />
        </div>

        <div className="glass rounded-3xl p-6 sm:p-8">
          <h1 className="text-display-sm text-paper">Регистрация компании</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-paper-dim">
            Кабинет откроется сразу. Студенты увидят компанию и вакансии после проверки
            агентством — это защищает их от фейковых работодателей.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3" noValidate>
            <TextField
              label="Название компании"
              autoComplete="organization"
              value={form.companyName}
              error={errors.companyName}
              onChange={(e) => patch({ companyName: e.target.value })}
            />
            <TextField
              label="Кто будет вести кабинет"
              autoComplete="name"
              value={form.contactName}
              error={errors.contactName}
              hint="Имя и фамилия. Студентам не показывается."
              onChange={(e) => patch({ contactName: e.target.value })}
            />
            <TextField
              label="Рабочая почта"
              type="email"
              autoComplete="email"
              value={form.email}
              error={errors.email}
              onChange={(e) => patch({ email: e.target.value })}
            />
            <TextField
              label="Пароль"
              type="password"
              autoComplete="new-password"
              value={form.password}
              error={errors.password}
              hint="Минимум 8 символов, буквы и цифры"
              onChange={(e) => patch({ password: e.target.value })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Отрасль"
                value={form.industry}
                error={errors.industry}
                hint="Необязательно"
                onChange={(e) => patch({ industry: e.target.value })}
              />
              <TextField
                label="Город"
                autoComplete="address-level2"
                value={form.city}
                error={errors.city}
                hint="Необязательно"
                onChange={(e) => patch({ city: e.target.value })}
              />
            </div>

            <button
              type="button"
              role="checkbox"
              aria-checked={form.consent}
              onClick={() => patch({ consent: !form.consent })}
              className={cn(
                'flex w-full items-start gap-3 rounded-2xl border p-4 text-left text-[13px] leading-relaxed transition-colors',
                errors.consent
                  ? 'border-danger/50 bg-danger/[0.06]'
                  : 'border-[var(--hairline)] bg-graphite-950/40 hover:border-paper/20',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
                  form.consent ? 'border-accent-400 bg-accent-500' : 'border-paper/30',
                )}
              >
                {form.consent && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={springSnappy}>
                    <Check className="size-3.5 text-paper" aria-hidden />
                  </motion.span>
                )}
              </span>
              <span className="text-paper-dim">
                Согласен на обработку моих персональных данных — имени и рабочей почты — Fattakhov HR
                Agency для работы кабинета компании.
              </span>
            </button>
            {errors.consent && <p className="text-[12.5px] text-danger">{errors.consent}</p>}

            <Button type="submit" size="lg" loading={pending} className="mt-2 w-full" iconRight={<ArrowRight />}>
              Зарегистрировать компанию
            </Button>
          </form>
        </div>

        <div className="mt-6 space-y-1.5 text-center text-[13px] text-paper-faint">
          <p>
            Уже есть кабинет?{' '}
            <Link href="/login" className="text-paper underline-offset-4 hover:underline">
              Войти
            </Link>
          </p>
          <p>
            Вы студент?{' '}
            <Link href="/register" className="text-paper underline-offset-4 hover:underline">
              Регистрация студента
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
