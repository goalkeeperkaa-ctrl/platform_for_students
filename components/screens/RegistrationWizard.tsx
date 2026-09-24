'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { z } from 'zod';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { BirthDateField } from '@/components/forms/BirthDateField';
import { ConfirmCodeStep } from '@/components/forms/ConfirmCodeStep';
import { PhotoUpload } from '@/components/forms/PhotoUpload';
import { ResumeUpload } from '@/components/forms/ResumeUpload';
import { ScheduleFields } from '@/components/forms/ScheduleFields';
import { SkillsInput } from '@/components/forms/SkillsInput';
import { ConsentChecks } from '@/components/legal/ConsentChecks';
import { useCurtainNav } from '@/components/motion/RouteCurtain';
import { durations, easeOutExpo, springSoft, stepVariants } from '@/lib/motion';
import { PILOT_CITY } from '@/lib/pilot';
import { registrationSteps } from '@/lib/validation';
import {
  GENDERS,
  LOOKING_FOR,
  LOOKING_FOR_LABEL,
  type Gender,
  type LookingFor,
  type Weekday,
} from '@/lib/types';

const STEP_META = [
  { key: 'identity', title: 'Как вас зовут', hint: 'Так вас увидит работодатель' },
  { key: 'photo', title: 'Добавьте фото', hint: 'Профили с фото открывают в три раза чаще' },
  { key: 'schedule', title: 'Когда можете работать', hint: 'Главный фильтр подбора' },
  { key: 'skills', title: 'Что вы умеете', hint: 'Навыки поднимают вакансии в ленте' },
  { key: 'account', title: 'Вход и согласие', hint: 'Последний шаг' },
] as const;

const GENDER_LABEL: Record<Gender, string> = {
  FEMALE: 'Женский',
  MALE: 'Мужской',
  UNSPECIFIED: 'Не указывать',
};

interface FormState {
  fullName: string;
  gender: Gender;
  birthDate: string;
  photoUrl: string | null;
  city: string;
  workDays: Weekday[];
  hoursPerWeek: number | null;
  skills: string[];
  lookingFor: LookingFor[];
  about: string;
  resumeUrl: string | null;
  resumeName: string | null;
  email: string;
  password: string;
  phone: string;
  consent: boolean;
  terms: boolean;
  marketing: boolean;
}

const INITIAL: FormState = {
  fullName: '',
  gender: 'UNSPECIFIED',
  birthDate: '',
  photoUrl: null,
  city: PILOT_CITY,
  workDays: [],
  hoursPerWeek: 20,
  skills: [],
  lookingFor: [],
  about: '',
  resumeUrl: null,
  resumeName: null,
  email: '',
  password: '',
  phone: '',
  consent: false,
  terms: false,
  marketing: false,
};

/**
 * Мастер регистрации.
 *
 * Пять коротких шагов вместо одной длинной формы: студент заполняет её
 * с телефона между парами. Вуз, специальность и курс сюда не входят —
 * это не влияет на подбор вакансий, поэтому их можно дозаполнить в
 * профиле уже после регистрации, не задерживая её. Каждый шаг
 * проверяется своей схемой — той же, что и на сервере, поэтому
 * «прошло на клиенте, отвергнуто сервером» здесь невозможно.
 *
 * Направление анимации зависит от того, куда идём: вперёд контент
 * приезжает справа, назад — слева. Это единственное, что подсказывает,
 * что шаги лежат на одной оси, а не подменяют друг друга.
 */
export function RegistrationWizard() {
  const toast = useToast();
  const navigate = useCurtainNav();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const meta = STEP_META[step];
  const isLast = step === STEP_META.length - 1;

  const patch = (values: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...values }));
    // Ошибка снимается при первом же исправлении, а не по кнопке «Далее»:
    // держать красное поле, которое человек уже починил, — бессмысленно
    setErrors((current) => {
      if (Object.keys(current).length === 0) return current;
      const next = { ...current };
      for (const key of Object.keys(values)) delete next[key];
      return next;
    });
  };

  const stepPayload = useMemo(() => {
    switch (meta.key) {
      case 'identity':
        return { fullName: form.fullName, gender: form.gender, birthDate: form.birthDate };
      case 'photo':
        return { photoUrl: form.photoUrl };
      case 'schedule':
        return { workDays: form.workDays, hoursPerWeek: form.hoursPerWeek };
      case 'skills':
        return {
          skills: form.skills,
          lookingFor: form.lookingFor,
          about: form.about || null,
          resumeUrl: form.resumeUrl,
          resumeName: form.resumeName,
        };
      case 'account':
        return {
          email: form.email,
          password: form.password,
          phone: form.phone,
          consent: form.consent,
          terms: form.terms,
          marketing: form.marketing,
        };
    }
  }, [form, meta.key]);

  function validate(): boolean {
    const schema = registrationSteps[meta.key] as z.ZodTypeAny;
    const result = schema.safeParse(stepPayload);
    if (result.success) {
      setErrors({});
      return true;
    }
    const next: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!next[key]) next[key] = issue.message;
    }
    setErrors(next);
    return false;
  }

  function goNext() {
    if (!validate()) return;
    if (!isLast) {
      setDirection(1);
      setStep((s) => s + 1);
      return;
    }
    void submit();
  }

  function goBack() {
    // На первом шаге отступать в мастере некуда — раньше кнопка тут
    // просто гасла, и это читалось как «не работает». Логичнее увести
    // туда, откуда и пришли на регистрацию.
    if (step === 0) {
      navigate('/');
      return;
    }
    setDirection(-1);
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  }

  async function submit() {
    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          city: form.city || null,
          about: form.about || null,
        }),
      });
      const data = (await response.json()) as {
        pending?: string;
        error?: string;
        fields?: Record<string, string>;
      };

      if (!response.ok) {
        if (data.fields) setErrors(data.fields);
        toast.error(data.error ?? 'Не удалось создать профиль');
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
    setPending(null);
    setDone(true);
    // Пауза ради галочки: она подтверждает, что данные приняты,
    // и отделяет форму от ленты
    setTimeout(() => navigate(data.redirectTo ?? '/feed'), 1250);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page-x mx-auto flex h-[var(--header-h)] w-full max-w-2xl items-center justify-between">
        <Logo href="/" />
        <span className="text-[12.5px] tabular-nums text-paper-faint">
          Шаг {step + 1} из {STEP_META.length}
        </span>
      </header>

      <div className="page-x mx-auto w-full max-w-2xl">
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-paper/[0.07]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-200"
            initial={false}
            animate={{ scaleX: (step + 1) / STEP_META.length }}
            style={{ transformOrigin: 'left' }}
            transition={springSoft}
          />
        </div>
      </div>

      <main className="page-x mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center pb-12 pt-10">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          {done ? (
            <SuccessState key="done" name={form.fullName} />
          ) : pending ? (
            <ConfirmCodeStep
              key="pending"
              email={form.email}
              pending={pending}
              confirmUrl="/api/auth/register/confirm"
              resendUrl="/api/auth/register/resend"
              onVerified={onVerified}
              onRestart={() => setPending(null)}
            />
          ) : (
            <motion.section
              key={meta.key}
              custom={direction}
              variants={stepVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              className="min-h-[26rem]"
            >
              <motion.h1
                variants={stepVariants}
                className="text-display-md text-paper"
              >
                {meta.title}
              </motion.h1>
              <p className="mt-2.5 text-[14.5px] text-paper-dim">{meta.hint}</p>

              <div className="mt-9">{renderStep()}</div>
            </motion.section>
          )}
        </AnimatePresence>

        {!done && !pending && (
          <div className="mt-10 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="lg"
              onClick={goBack}
              disabled={submitting}
              icon={<ArrowLeft />}
            >
              Назад
            </Button>

            <div className="flex items-center gap-2">
              <Button
                size="lg"
                onClick={goNext}
                loading={submitting}
                iconRight={isLast ? <Check /> : <ArrowRight />}
              >
                {isLast ? 'Создать профиль' : 'Далее'}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );

  function renderStep() {
    switch (meta.key) {
      case 'identity':
        return (
          <div className="space-y-5">
            <TextField
              label="Фамилия и имя"
              autoComplete="name"
              autoFocus
              value={form.fullName}
              error={errors.fullName}
              onChange={(e) => patch({ fullName: e.target.value })}
            />

            <fieldset>
              <legend className="mb-3 text-[12.5px] uppercase tracking-[0.12em] text-paper-faint">
                Пол
              </legend>
              <div className="flex flex-wrap gap-2">
                {GENDERS.map((gender) => (
                  <Chip
                    key={gender}
                    selected={form.gender === gender}
                    onToggle={() => patch({ gender })}
                  >
                    {GENDER_LABEL[gender]}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <BirthDateField
              value={form.birthDate}
              error={errors.birthDate}
              onChange={(birthDate) => patch({ birthDate })}
            />
          </div>
        );

      case 'photo':
        return (
          <div className="space-y-6">
            <PhotoUpload
              value={form.photoUrl}
              name={form.fullName || 'Профиль'}
              onChange={(photoUrl) => patch({ photoUrl })}
            />
            <p className="text-center text-[13px] text-paper-faint">
              Шаг можно пропустить — фото добавляется и позже.
            </p>
          </div>
        );

      case 'schedule':
        return (
          <ScheduleFields
            workDays={form.workDays}
            hoursPerWeek={form.hoursPerWeek}
            errors={errors}
            onChange={(next) => patch(next)}
          />
        );

      case 'skills':
        return (
          <div className="space-y-7">
            <fieldset>
              <legend className="mb-3 text-[12.5px] uppercase tracking-[0.12em] text-paper-faint">
                Что ищете
              </legend>
              <div className="flex flex-wrap gap-2">
                {LOOKING_FOR.map((kind) => (
                  <Chip
                    key={kind}
                    selected={form.lookingFor.includes(kind)}
                    onToggle={() =>
                      patch({
                        lookingFor: form.lookingFor.includes(kind)
                          ? form.lookingFor.filter((k) => k !== kind)
                          : [...form.lookingFor, kind],
                      })
                    }
                  >
                    {LOOKING_FOR_LABEL[kind]}
                  </Chip>
                ))}
              </div>
              <p className="pt-3 text-[12.5px] leading-snug text-paper-faint">
                Проекты, достижения и остальное портфолио — в разделе «Профиль» после регистрации.
              </p>
            </fieldset>
            <div>
              <p className="mb-3 text-[12.5px] uppercase tracking-[0.12em] text-paper-faint">
                Навыки
              </p>
              <SkillsInput value={form.skills} onChange={(skills) => patch({ skills })} />
              {errors.skills && <p className="pt-2 text-[12.5px] text-danger">{errors.skills}</p>}
            </div>

            <TextAreaField
              label="Пара слов о себе"
              value={form.about}
              maxCount={600}
              error={errors.about}
              onChange={(e) => patch({ about: e.target.value })}
              hint="Необязательно. Что вам интересно и когда удобно выходить."
            />

            <ResumeUpload
              value={form.resumeUrl}
              fileName={form.resumeName}
              onChange={(file) =>
                patch({ resumeUrl: file?.url ?? null, resumeName: file?.name ?? null })
              }
            />
          </div>
        );

      case 'account':
        return (
          <div className="space-y-5">
            <TextField
              label="Почта"
              type="email"
              autoComplete="email"
              autoFocus
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
            <TextField
              label="Телефон"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              error={errors.phone}
              hint="Необязательно. Виден только тем, кому вы откликнулись."
              onChange={(e) => patch({ phone: e.target.value })}
            />

            <ConsentChecks
              kind="student"
              value={{ consent: form.consent, terms: form.terms, marketing: form.marketing }}
              errors={errors}
              onChange={(next) => patch(next)}
            />
          </div>
        );
    }
  }
}

function SuccessState({ name }: { name: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: durations.base, ease: easeOutExpo }}
      className="flex flex-1 flex-col items-center justify-center py-16 text-center"
    >
      <motion.svg
        viewBox="0 0 64 64"
        className="size-20 text-yes-glow"
        fill="none"
        initial="hidden"
        animate="show"
      >
        <motion.circle
          cx="32"
          cy="32"
          r="29"
          stroke="currentColor"
          strokeWidth="2.5"
          opacity={0.35}
          variants={{ hidden: { pathLength: 0 }, show: { pathLength: 1 } }}
          transition={{ duration: 0.7, ease: easeOutExpo }}
        />
        <motion.path
          d="M20 33.5 L28.5 42 L45 24"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          variants={{ hidden: { pathLength: 0 }, show: { pathLength: 1 } }}
          transition={{ duration: 0.5, ease: easeOutExpo, delay: 0.35 }}
        />
      </motion.svg>

      <h2 className="mt-8 text-display-sm text-paper">Профиль создан</h2>
      <p className="mt-3 max-w-[36ch] text-[15px] leading-relaxed text-paper-dim">
        {name ? `${name.split(' ')[0]}, п` : 'П'}одборка уже собирается под ваш график. Сейчас
        откроем ленту.
      </p>
      <p className="mt-3 max-w-[40ch] text-[13.5px] leading-relaxed text-paper-faint">
        Чтобы отклики уходили работодателям, загрузите в профиле справку об обучении —
        HR-менеджер подтвердит учёбу.
      </p>
      <Link
        href="/feed"
        className="mt-6 text-[13px] text-paper-faint underline-offset-4 transition-colors hover:text-paper hover:underline"
      >
        Перейти сразу
      </Link>
    </motion.div>
  );
}
