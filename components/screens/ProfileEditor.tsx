'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { PhotoUpload } from '@/components/forms/PhotoUpload';
import { ResumeUpload } from '@/components/forms/ResumeUpload';
import { SkillsInput } from '@/components/forms/SkillsInput';
import { durations, easeOutExpo } from '@/lib/motion';
import { profileUpdateSchema } from '@/lib/validation';
import { GENDERS, WEEKDAYS, WEEKDAY_LABEL, type Gender, type Weekday } from '@/lib/types';

const CURRENT_YEAR = new Date().getFullYear();
const HOURS_OPTIONS = [8, 12, 16, 20, 24, 30, 40];

const GENDER_LABEL: Record<Gender, string> = {
  FEMALE: 'Женский',
  MALE: 'Мужской',
  UNSPECIFIED: 'Не указывать',
};

export interface ProfileFormState {
  fullName: string;
  phone: string;
  gender: Gender;
  birthYear: number;
  photoUrl: string | null;
  resumeUrl: string | null;
  resumeName: string | null;
  university: string;
  speciality: string;
  studyYear: number;
  city: string;
  workDays: Weekday[];
  hoursPerWeek: number | null;
  skills: string[];
  about: string;
}

/**
 * Свой профиль.
 *
 * Одной страницей, а не мастером из шести шагов: мастер ведёт человека,
 * который ещё не знает, что у него спросят. Здесь он знает и пришёл
 * поправить одно поле — вести его по шагам значило бы заставить пройти
 * все шесть ради города.
 *
 * Кнопка сохранения появляется, только когда есть что сохранять. Форма
 * с вечно активной кнопкой не даёт понять, изменилось ли что-нибудь
 * вообще, и человек жмёт её на всякий случай.
 */
export function ProfileEditor({
  initial,
  email,
  consent,
}: {
  initial: ProfileFormState;
  email: string;
  consent: { version: string; at: string };
}) {
  const router = useRouter();
  const toast = useToast();

  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  function patch(values: Partial<ProfileFormState>) {
    setForm((current) => ({ ...current, ...values }));
    setErrors((current) => {
      if (Object.keys(current).length === 0) return current;
      const next = { ...current };
      for (const key of Object.keys(values)) delete next[key];
      return next;
    });
  }

  async function save() {
    const payload = {
      ...form,
      city: form.city || null,
      about: form.about || null,
      phone: form.phone || '',
    };

    // Проверяем теми же правилами, что и сервер: иначе человек узнаёт
    // об ошибке в поле только после запроса и с чужой формулировкой
    const parsed = profileUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/students/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string; fields?: Record<string, string> };

      if (!response.ok) {
        if (data.fields) setErrors(data.fields);
        toast.error(data.error ?? 'Не удалось сохранить');
        return;
      }

      setSaved(form);
      toast.success('Профиль сохранён');
      // Шапка показывает имя из сессии — обновляем её серверную часть
      router.refresh();
    } catch {
      toast.error('Сеть недоступна', 'Проверьте соединение и попробуйте ещё раз');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[42rem] pb-16">
      <header className="mb-8">
        <h1 className="text-display-md text-paper">Профиль</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-paper-dim">
          Так вас видит работодатель, которому вы откликнулись. Изменения
          применяются к будущим откликам и к ленте подбора.
        </p>
      </header>

      <div className="space-y-8">
        <Section title="Фото">
          <PhotoUpload
            value={form.photoUrl}
            name={form.fullName || 'Профиль'}
            onChange={(photoUrl) => patch({ photoUrl })}
          />
        </Section>

        <Section title="О вас">
          <div className="space-y-5">
            <TextField
              label="Фамилия и имя"
              autoComplete="name"
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
                  <Chip key={gender} selected={form.gender === gender} onToggle={() => patch({ gender })}>
                    {GENDER_LABEL[gender]}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <SelectField
              label="Год рождения"
              value={String(form.birthYear)}
              error={errors.birthYear}
              onChange={(e) => patch({ birthYear: Number(e.target.value) })}
              options={Array.from({ length: 27 }, (_, i) => {
                const year = CURRENT_YEAR - 14 - i;
                return { value: String(year), label: String(year) };
              })}
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
          </div>
        </Section>

        <Section title="Учёба">
          <div className="space-y-5">
            <TextField
              label="Вуз"
              value={form.university}
              error={errors.university}
              onChange={(e) => patch({ university: e.target.value })}
            />
            <TextField
              label="Специальность"
              value={form.speciality}
              error={errors.speciality}
              onChange={(e) => patch({ speciality: e.target.value })}
            />
            <fieldset>
              <legend className="mb-3 text-[12.5px] uppercase tracking-[0.12em] text-paper-faint">
                Курс
              </legend>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6].map((year) => (
                  <Chip
                    key={year}
                    selected={form.studyYear === year}
                    onToggle={() => patch({ studyYear: year })}
                  >
                    {year}
                  </Chip>
                ))}
              </div>
              {errors.studyYear && <p className="pt-2 text-[12.5px] text-danger">{errors.studyYear}</p>}
            </fieldset>
            <TextField
              label="Город"
              value={form.city}
              error={errors.city}
              onChange={(e) => patch({ city: e.target.value })}
            />
          </div>
        </Section>

        <Section title="Когда можете работать">
          <div className="space-y-8">
            <fieldset>
              <legend className="mb-3 text-[12.5px] uppercase tracking-[0.12em] text-paper-faint">
                Дни
              </legend>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => (
                  <Chip
                    key={day}
                    selected={form.workDays.includes(day)}
                    onToggle={() =>
                      patch({
                        workDays: form.workDays.includes(day)
                          ? form.workDays.filter((d) => d !== day)
                          : [...form.workDays, day],
                      })
                    }
                    className="min-w-[3.25rem] justify-center"
                  >
                    {WEEKDAY_LABEL[day]}
                  </Chip>
                ))}
              </div>
              {errors.workDays && <p className="pt-2.5 text-[12.5px] text-danger">{errors.workDays}</p>}
            </fieldset>

            <fieldset>
              <legend className="mb-3 text-[12.5px] uppercase tracking-[0.12em] text-paper-faint">
                Часов в неделю
              </legend>
              <div className="flex flex-wrap gap-2">
                {HOURS_OPTIONS.map((hours) => (
                  <Chip
                    key={hours}
                    selected={form.hoursPerWeek === hours}
                    onToggle={() => patch({ hoursPerWeek: hours })}
                  >
                    до {hours} ч
                  </Chip>
                ))}
              </div>
            </fieldset>
          </div>
        </Section>

        <Section title="Навыки и резюме">
          <div className="space-y-7">
            <div>
              <SkillsInput value={form.skills} onChange={(skills) => patch({ skills })} />
              {errors.skills && <p className="pt-2 text-[12.5px] text-danger">{errors.skills}</p>}
            </div>

            <TextAreaField
              label="Пара слов о себе"
              value={form.about}
              maxCount={600}
              error={errors.about}
              onChange={(e) => patch({ about: e.target.value })}
            />

            <ResumeUpload
              value={form.resumeUrl}
              fileName={form.resumeName}
              onChange={(file) => patch({ resumeUrl: file?.url ?? null, resumeName: file?.name ?? null })}
            />
          </div>
        </Section>

        <Section title="Вход и согласие">
          <div className="space-y-4 text-[13.5px] leading-relaxed">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-paper-faint">Почта</span>
              <span className="text-paper">{email}</span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-paper-faint">
              Почта — это вход в аккаунт, поменять её здесь нельзя: смена
              требует подтверждения нового адреса. Напишите в агентство, если
              адрес нужно изменить.
            </p>
            <div className="flex items-start gap-2.5 border-t border-[var(--hairline)] pt-4 text-paper-faint">
              <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden />
              <span>
                Согласие на обработку персональных данных, версия {consent.version},
                дано {consent.at}.
              </span>
            </div>
          </div>
        </Section>

        <DangerZone />
      </div>

      {/*
        Панель сохранения приклеена к низу и появляется только при
        изменениях. Кнопка в конце длинной формы означает прокрутку через
        всю страницу ради одной правки в первом поле.
      */}
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: durations.base, ease: easeOutExpo }}
            className="page-x fixed inset-x-0 bottom-0 z-40 border-t border-[var(--hairline)] bg-ink/85 py-4 backdrop-blur-glass"
          >
            <div className="mx-auto flex max-w-[42rem] items-center justify-between gap-4">
              <span className="text-[13px] text-paper-dim">Есть несохранённые изменения</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" disabled={saving} onClick={() => setForm(saved)}>
                  Отменить
                </Button>
                <Button size="sm" loading={saving} onClick={() => void save()} icon={<Check />}>
                  Сохранить
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-3xl p-6 sm:p-7">
      <h2 className="mb-5 text-[12.5px] uppercase tracking-[0.12em] text-paper-faint">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Удаление профиля.
 *
 * Подтверждение — вводом слова, а не кнопкой «точно?»: вторую кнопку
 * нажимают на том же движении, что и первую. Удаление необратимо и
 * уносит отклики и переписку, поэтому здесь нужна пауза, а не щелчок.
 */
function DangerZone() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [pending, setPending] = useState(false);

  const CONFIRM = 'УДАЛИТЬ';

  async function remove() {
    setPending(true);
    try {
      const response = await fetch('/api/students/me', { method: 'DELETE' });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? 'Не удалось удалить профиль');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      toast.error('Сеть недоступна', 'Проверьте соединение и попробуйте ещё раз');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-3xl border border-danger/25 bg-danger/[0.05] p-6 sm:p-7">
      <h2 className="mb-2 flex items-center gap-2 text-[12.5px] uppercase tracking-[0.12em] text-danger">
        <TriangleAlert className="size-3.5" aria-hidden />
        Удаление профиля
      </h2>
      <p className="text-[13.5px] leading-relaxed text-paper-dim">
        Удаляются анкета, отклики и переписка с работодателями. Восстановить
        их нельзя. Работодатели, которым вы уже откликнулись, перестанут
        видеть ваши контакты.
      </p>

      {!open ? (
        <Button variant="danger" size="sm" className="mt-5" onClick={() => setOpen(true)} icon={<Trash2 />}>
          Удалить профиль
        </Button>
      ) : (
        <div className="mt-5 space-y-4">
          <TextField
            label={`Впишите «${CONFIRM}», чтобы подтвердить`}
            value={word}
            onChange={(e) => setWord(e.target.value.toUpperCase())}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="sm"
              loading={pending}
              disabled={word !== CONFIRM}
              onClick={() => void remove()}
              icon={<Trash2 />}
            >
              Удалить навсегда
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setWord('');
              }}
            >
              Не надо
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
