'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { ConfirmCodeStep } from '@/components/forms/ConfirmCodeStep';
import { ConsentChecks } from '@/components/legal/ConsentChecks';
import { companyRegistrationSchema } from '@/lib/company';
import { normalizeInn } from '@/lib/inn';
import { durations, easeOutExpo } from '@/lib/motion';
import { PILOT_CITY } from '@/lib/pilot';

interface FormState {
  companyName: string;
  inn: string;
  contactName: string;
  phone: string;
  email: string;
  password: string;
  industry: string;
  city: string;
  consent: boolean;
  terms: boolean;
  marketing: boolean;
}

const INITIAL: FormState = {
  companyName: '',
  inn: '',
  contactName: '',
  phone: '',
  email: '',
  password: '',
  industry: '',
  city: PILOT_CITY,
  consent: false,
  terms: false,
  marketing: false,
};

/**
 * Регистрация компании.
 *
 * Одна короткая форма, а не мастер: у компании на входе нужно ровно то,
 * без чего нельзя завести кабинет и проверить компанию. Страницу компании —
 * описание, фото, культуру — заполняют уже внутри, спокойно, а не на пороге.
 *
 * ИНН и телефон — для проверки: HR-менеджер сверяет ИНН с госреестром и,
 * если в открытых источниках о компании ничего нет, звонит. Сразу говорим
 * про модерацию: компания, которая узнаёт о проверке только после того, как
 * оформила вакансию, чувствует себя обманутой.
 */
export function CompanyRegistrationForm() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

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

    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/register/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        pending?: string;
        error?: string;
        fields?: Record<string, string>;
      };
      if (!response.ok) {
        if (data.fields) setErrors(data.fields);
        toast.error(data.error ?? 'Не удалось зарегистрировать компанию');
        return;
      }
      setPending(data.pending ?? null);
    } catch {
      toast.error('Сеть недоступна', 'Проверьте соединение и попробуйте ещё раз');
    } finally {
      setSubmitting(false);
    }
  }

  function onVerified(data: { redirectTo?: string }) {
    router.push(data.redirectTo ?? '/employer/company');
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-16">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: durations.slow, ease: easeOutExpo }}
        className="w-full max-w-[30rem]"
      >
        <div className="mb-9 flex justify-center">
          <Logo />
        </div>

        <div className="glass rounded-3xl p-6 sm:p-8">
          {pending ? (
            <ConfirmCodeStep
              email={form.email}
              pending={pending}
              confirmUrl="/api/auth/register/company/confirm"
              resendUrl="/api/auth/register/company/resend"
              onVerified={onVerified}
              onRestart={() => setPending(null)}
            />
          ) : (
            <>
          <h1 className="text-display-sm text-paper">Регистрация компании</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-paper-dim">
            Кабинет откроется после подтверждения почты кодом. Студенты увидят компанию и вакансии
            после проверки агентством: HR-менеджер сверит ИНН с госреестром и при необходимости
            позвонит. Это защищает студентов от фейковых работодателей.
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
              label="ИНН"
              inputMode="numeric"
              autoComplete="off"
              maxLength={12}
              value={form.inn}
              error={errors.inn}
              hint="10 цифр у организации, 12 у ИП. По нему агентство проверит компанию в госреестре."
              onChange={(e) => patch({ inn: normalizeInn(e.target.value).slice(0, 12) })}
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
              label="Телефон для связи"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              error={errors.phone}
              hint="HR-менеджер позвонит, если нужно подтвердить компанию. Студентам не показывается."
              onChange={(e) => patch({ phone: e.target.value })}
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
                hint="Пилот — в Казани"
                onChange={(e) => patch({ city: e.target.value })}
              />
            </div>

            <div className="pt-2">
              <ConsentChecks
                kind="company"
                value={{ consent: form.consent, terms: form.terms, marketing: form.marketing }}
                errors={errors}
                onChange={(next) => patch(next)}
              />
            </div>

            <Button type="submit" size="lg" loading={submitting} className="mt-2 w-full" iconRight={<ArrowRight />}>
              Зарегистрировать компанию
            </Button>
          </form>
            </>
          )}
        </div>

        {!pending && (
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
        )}
      </motion.div>
    </div>
  );
}
