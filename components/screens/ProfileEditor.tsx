'use client';

import { NotificationToggle } from '@/components/account/NotificationToggle';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Plus, ShieldCheck, Trash2, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { PhotoUpload } from '@/components/forms/PhotoUpload';
import { BirthDateField } from '@/components/forms/BirthDateField';
import { ResumeUpload } from '@/components/forms/ResumeUpload';
import { ScheduleFields } from '@/components/forms/ScheduleFields';
import { SkillsInput } from '@/components/forms/SkillsInput';
import { UniversityInput } from '@/components/forms/UniversityInput';
import { VideoUpload } from '@/components/forms/VideoUpload';
import { StudyDocumentCard } from '@/components/student/StudyDocumentCard';
import { StudyVerificationNote } from '@/components/student/StudyVerificationNote';
import { durations, easeOutExpo } from '@/lib/motion';
import { COMPLETE_PROFILE_PERCENT, profileCompleteness } from '@/lib/portfolio';
import { profileUpdateSchema } from '@/lib/validation';
import {
  ACTIVITY_KINDS,
  ACTIVITY_KIND_LABEL,
  GENDERS,
  LOOKING_FOR,
  LOOKING_FOR_LABEL,
  WEEKDAYS,
  WEEKDAY_LABEL,
  type AchievementItem,
  type ActivityItem,
  type Gender,
  type InstitutionOption,
  type LinkItem,
  type LookingFor,
  type ProjectItem,
  type StudyStateDTO,
  type Weekday,
} from '@/lib/types';


/** Те же пределы, что в lib/portfolio.ts: кнопка «Добавить» гаснет раньше, чем сервер откажет. */
const LIMITS = { projects: 10, achievements: 15, activities: 10, links: 10 } as const;

const GENDER_LABEL: Record<Gender, string> = {
  FEMALE: 'Женский',
  MALE: 'Мужской',
  UNSPECIFIED: 'Не указывать',
};

export interface ProfileFormState {
  fullName: string;
  phone: string;
  gender: Gender;
  birthDate: string;
  photoUrl: string | null;
  resumeUrl: string | null;
  resumeName: string | null;
  university: string;
  institutionId: string | null;
  speciality: string;
  studyYear: number;
  city: string;
  workDays: Weekday[];
  hoursPerWeek: number | null;
  skills: string[];
  about: string;
  lookingFor: LookingFor[];
  goals: string;
  projects: ProjectItem[];
  achievements: AchievementItem[];
  activities: ActivityItem[];
  hobbies: string;
  links: LinkItem[];
  videoUrl: string;
}

function replaceAt<T>(list: T[], index: number, change: Partial<T>): T[] {
  return list.map((item, i) => (i === index ? { ...item, ...change } : item));
}

function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/**
 * Свой профиль-портфолио.
 *
 * Одной страницей, а не мастером из шести шагов: мастер ведёт человека,
 * который ещё не знает, что у него спросят. Здесь он знает и пришёл
 * поправить одно поле — вести его по шагам значило бы заставить пройти
 * все шесть ради города.
 *
 * Кнопка сохранения появляется, только когда есть что сохранять. Форма
 * с вечно активной кнопкой не даёт понять, изменилось ли что-нибудь
 * вообще, и человек жмёт её на всякий случай.
 *
 * Заполненность считается на лету из того, что на экране, а не из
 * сохранённого: иначе процент стоял бы на месте, пока человек добавляет
 * проект, и подсказка «чего не хватает» врала бы до сохранения.
 */
export function ProfileEditor({
  initial,
  email,
  consent,
  institutions,
  studyVerified,
  study,
}: {
  initial: ProfileFormState;
  email: string;
  consent: { version: string; at: string };
  institutions: InstitutionOption[];
  studyVerified: boolean;
  study: StudyStateDTO;
}) {
  const router = useRouter();
  const toast = useToast();

  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const completeness = useMemo(
    () =>
      profileCompleteness({
        ...form,
        about: form.about || null,
        goals: form.goals || null,
        hobbies: form.hobbies || null,
        videoUrl: form.videoUrl || null,
      }),
    [form],
  );

  function patch(values: Partial<ProfileFormState>) {
    setForm((current) => ({ ...current, ...values }));
    // Ошибка снимается при первом же исправлении. У списков ошибки лежат
    // под ключами вида «projects.0.title» — снимаем и их вместе со списком
    setErrors((current) => {
      if (Object.keys(current).length === 0) return current;
      const next = { ...current };
      for (const key of Object.keys(values)) {
        for (const errorKey of Object.keys(next)) {
          if (errorKey === key || errorKey.startsWith(`${key}.`)) delete next[errorKey];
        }
      }
      return next;
    });
  }

  async function save() {
    const payload = {
      ...form,
      city: form.city || null,
      about: form.about || null,
      phone: form.phone || '',
      goals: form.goals || null,
      hobbies: form.hobbies || null,
      videoUrl: form.videoUrl || null,
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
      // Ошибка может быть в блоке, до которого человек не долистал
      toast.error('Проверьте поля, отмеченные красным');
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

  const complete = completeness.percent >= COMPLETE_PROFILE_PERCENT;

  return (
    <div className="mx-auto w-full max-w-[42rem] pb-28">
      <header className="mb-8">
        <h1 className="text-display-md text-paper">Профиль</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-paper-dim">
          Так вас видит работодатель, которому вы откликнулись. Это не резюме:
          здесь считается и то, что вы делали, пробовали и организовывали.
        </p>
      </header>

      <div className="space-y-8">
        <section className="glass rounded-3xl p-6 sm:p-7" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[12.5px] uppercase tracking-[0.12em] text-paper-faint">
              Заполненность профиля
            </h2>
            <span className="text-[20px] font-semibold tabular-nums text-paper">{completeness.percent}%</span>
          </div>
          <div className="mt-3 h-[5px] w-full overflow-hidden rounded-full bg-paper/[0.08]">
            <motion.div
              className={complete ? 'h-full rounded-full bg-yes-glow' : 'h-full rounded-full bg-accent-400'}
              initial={false}
              animate={{ width: `${completeness.percent}%` }}
              transition={{ duration: durations.base, ease: easeOutExpo }}
            />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-paper-dim">
            {complete
              ? 'Профиль выглядит полно — работодатель увидит больше, чем резюме.'
              : 'Работодатели охотнее отвечают на заполненные профили.'}
            {completeness.missing.length > 0 && (
              <span className="block text-paper-faint">Не хватает: {completeness.missing.join(', ')}.</span>
            )}
          </p>
        </section>

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

            <BirthDateField
              value={form.birthDate}
              error={errors.birthDate}
              onChange={(birthDate) => patch({ birthDate })}
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

            <TextAreaField
              label="Пара слов о себе"
              value={form.about}
              maxCount={600}
              error={errors.about}
              onChange={(e) => patch({ about: e.target.value })}
            />
          </div>
        </Section>

        <Section title="Учёба">
          <div className="space-y-5">
            <UniversityInput
              value={form.university}
              institutionId={form.institutionId}
              institutions={institutions}
              error={errors.university ?? errors.institutionId}
              onChange={(next) => patch(next)}
            />
            <StudyVerificationNote
              verified={studyVerified}
              changed={form.university !== saved.university || form.institutionId !== saved.institutionId}
              institutionSlug={institutions.find((i) => i.id === form.institutionId)?.slug ?? null}
            />
            {!studyVerified && <StudyDocumentCard state={study} />}
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
          <ScheduleFields
            workDays={form.workDays}
            hoursPerWeek={form.hoursPerWeek}
            errors={errors}
            onChange={(next) => patch(next)}
          />
        </Section>

        <Section title="Что ищете и зачем">
          <div className="space-y-5">
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
            </fieldset>
            <TextAreaField
              label="Цели и профессиональные интересы"
              value={form.goals}
              maxCount={600}
              error={errors.goals}
              hint="Кем хотите стать, что интересно, куда растёте."
              onChange={(e) => patch({ goals: e.target.value })}
            />
          </div>
        </Section>

        <Section title="Проекты">
          <p className="mb-4 text-[13px] leading-relaxed text-paper-faint">
            Учебные, свои, предпринимательские, IT, творческие — всё, что вы делали сами.
          </p>
          {errors.projects && <p className="mb-3 text-[12.5px] text-danger">{errors.projects}</p>}
          <div className="space-y-3">
            {form.projects.map((project, i) => (
              <ItemCard key={i} onRemove={() => patch({ projects: removeAt(form.projects, i) })} label="проект">
                <TextField
                  label="Название"
                  value={project.title}
                  error={errors[`projects.${i}.title`]}
                  onChange={(e) => patch({ projects: replaceAt(form.projects, i, { title: e.target.value }) })}
                />
                <TextAreaField
                  label="Что сделали"
                  value={project.description ?? ''}
                  maxCount={600}
                  error={errors[`projects.${i}.description`]}
                  onChange={(e) =>
                    patch({ projects: replaceAt(form.projects, i, { description: e.target.value }) })
                  }
                />
                <TextField
                  label="Ссылка"
                  type="url"
                  inputMode="url"
                  value={project.link ?? ''}
                  error={errors[`projects.${i}.link`]}
                  hint="Необязательно. https://…"
                  onChange={(e) => patch({ projects: replaceAt(form.projects, i, { link: e.target.value }) })}
                />
              </ItemCard>
            ))}
          </div>
          <AddButton
            disabled={form.projects.length >= LIMITS.projects}
            onClick={() => patch({ projects: [...form.projects, { title: '', description: null, link: null }] })}
          >
            Добавить проект
          </AddButton>
        </Section>

        <Section title="Достижения">
          <p className="mb-4 text-[13px] leading-relaxed text-paper-faint">
            Олимпиады, конкурсы, конференции, дипломы — и участие тоже, не только победы.
          </p>
          {errors.achievements && <p className="mb-3 text-[12.5px] text-danger">{errors.achievements}</p>}
          <div className="space-y-3">
            {form.achievements.map((item, i) => (
              <ItemCard key={i} onRemove={() => patch({ achievements: removeAt(form.achievements, i) })} label="достижение">
                <TextField
                  label="Что"
                  value={item.title}
                  error={errors[`achievements.${i}.title`]}
                  onChange={(e) =>
                    patch({ achievements: replaceAt(form.achievements, i, { title: e.target.value }) })
                  }
                />
                <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                  <TextField
                    label="Подробнее"
                    value={item.description ?? ''}
                    error={errors[`achievements.${i}.description`]}
                    onChange={(e) =>
                      patch({ achievements: replaceAt(form.achievements, i, { description: e.target.value }) })
                    }
                  />
                  <TextField
                    label="Год"
                    type="number"
                    inputMode="numeric"
                    value={item.year === null ? '' : String(item.year)}
                    error={errors[`achievements.${i}.year`]}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      const year = value === '' ? null : Number(value);
                      patch({
                        achievements: replaceAt(form.achievements, i, {
                          year: year !== null && Number.isFinite(year) ? year : null,
                        }),
                      });
                    }}
                  />
                </div>
              </ItemCard>
            ))}
          </div>
          <AddButton
            disabled={form.achievements.length >= LIMITS.achievements}
            onClick={() =>
              patch({ achievements: [...form.achievements, { title: '', description: null, year: null }] })
            }
          >
            Добавить достижение
          </AddButton>
        </Section>

        <Section title="Занятия и активность">
          <p className="mb-4 text-[13px] leading-relaxed text-paper-faint">
            Спорт, музыкальная или художественная школа, языки, кружки, староста, волонтёрство, клубы.
          </p>
          {errors.activities && <p className="mb-3 text-[12.5px] text-danger">{errors.activities}</p>}
          <div className="space-y-3">
            {form.activities.map((item, i) => (
              <ItemCard key={i} onRemove={() => patch({ activities: removeAt(form.activities, i) })} label="занятие">
                <div className="flex flex-wrap gap-2">
                  {ACTIVITY_KINDS.map((kind) => (
                    <Chip
                      key={kind}
                      selected={item.kind === kind}
                      onToggle={() => patch({ activities: replaceAt(form.activities, i, { kind }) })}
                    >
                      {ACTIVITY_KIND_LABEL[kind]}
                    </Chip>
                  ))}
                </div>
                <TextField
                  label="Чем занимались"
                  value={item.title}
                  error={errors[`activities.${i}.title`]}
                  onChange={(e) => patch({ activities: replaceAt(form.activities, i, { title: e.target.value }) })}
                />
                <TextField
                  label="Подробнее"
                  value={item.description ?? ''}
                  error={errors[`activities.${i}.description`]}
                  hint="Необязательно: сколько лет, какая роль, результат."
                  onChange={(e) =>
                    patch({ activities: replaceAt(form.activities, i, { description: e.target.value }) })
                  }
                />
              </ItemCard>
            ))}
          </div>
          <AddButton
            disabled={form.activities.length >= LIMITS.activities}
            onClick={() =>
              patch({ activities: [...form.activities, { kind: 'SPORT', title: '', description: null }] })
            }
          >
            Добавить занятие
          </AddButton>
        </Section>

        <Section title="Хобби и интересы">
          <TextAreaField
            label="Чем увлекаетесь"
            value={form.hobbies}
            maxCount={400}
            error={errors.hobbies}
            onChange={(e) => patch({ hobbies: e.target.value })}
          />
        </Section>

        <Section title="Навыки и резюме">
          <div className="space-y-7">
            <div>
              <SkillsInput value={form.skills} onChange={(skills) => patch({ skills })} />
              {errors.skills && <p className="pt-2 text-[12.5px] text-danger">{errors.skills}</p>}
            </div>

            <ResumeUpload
              value={form.resumeUrl}
              fileName={form.resumeName}
              onChange={(file) => patch({ resumeUrl: file?.url ?? null, resumeName: file?.name ?? null })}
            />
          </div>
        </Section>

        <Section title="Ссылки и видео-визитка">
          <p className="mb-4 text-[13px] leading-relaxed text-paper-faint">
            Портфолио, сертификаты, GitHub, публикации. Только ссылки https://
          </p>
          {errors.links && <p className="mb-3 text-[12.5px] text-danger">{errors.links}</p>}
          <div className="space-y-3">
            {form.links.map((link, i) => (
              <ItemCard key={i} onRemove={() => patch({ links: removeAt(form.links, i) })} label="ссылку">
                <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                  <TextField
                    label="Подпись"
                    value={link.label}
                    error={errors[`links.${i}.label`]}
                    onChange={(e) => patch({ links: replaceAt(form.links, i, { label: e.target.value }) })}
                  />
                  <TextField
                    label="Ссылка"
                    type="url"
                    inputMode="url"
                    value={link.url}
                    error={errors[`links.${i}.url`]}
                    onChange={(e) => patch({ links: replaceAt(form.links, i, { url: e.target.value }) })}
                  />
                </div>
              </ItemCard>
            ))}
          </div>
          <AddButton
            disabled={form.links.length >= LIMITS.links}
            onClick={() => patch({ links: [...form.links, { label: '', url: '' }] })}
          >
            Добавить ссылку
          </AddButton>

          <div className="mt-6 space-y-3">
            {!form.videoUrl.startsWith('/api/files/studentVideo/') && (
              <TextField
                label="Видео-визитка"
                type="url"
                inputMode="url"
                value={form.videoUrl}
                error={errors.videoUrl}
                hint="Необязательно. Ссылка на видео: VK Видео, YouTube, Яндекс Диск — или загрузите файл ниже."
                onChange={(e) => patch({ videoUrl: e.target.value })}
              />
            )}
            <VideoUpload kind="studentVideo" value={form.videoUrl} onChange={(url) => patch({ videoUrl: url })} />
          </div>
        </Section>

        <Section title="Вход и согласие">
          <div className="space-y-4 text-[13.5px] leading-relaxed">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <span className="text-paper-faint">Почта</span>
              <span className="min-w-0 break-all text-paper">{email}</span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-paper-faint">
              Почта — это вход в аккаунт, поменять её здесь нельзя: смена
              требует подтверждения нового адреса. Напишите в агентство, если
              адрес нужно изменить.
            </p>
            <NotificationToggle audience="student" />
            <div className="flex items-start gap-2.5 border-t border-[var(--hairline)] pt-4 text-paper-faint">
              <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden />
              <span>
                Согласие на обработку персональных данных, версия {consent.version},
                дано {consent.at}.
              </span>
            </div>
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
              <Link href="/legal/consent" className="text-paper/80 underline underline-offset-4 hover:text-paper">
                Текст согласия
              </Link>
              <Link href="/legal/terms" className="text-paper/80 underline underline-offset-4 hover:text-paper">
                Пользовательское соглашение
              </Link>
              <Link href="/legal/privacy" className="text-paper/80 underline underline-offset-4 hover:text-paper">
                Политика обработки данных
              </Link>
            </p>
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
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    setForm(saved);
                    setErrors({});
                  }}
                >
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

function ItemCard({
  children,
  onRemove,
  label,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  label: string;
}) {
  return (
    <div className="relative space-y-3 rounded-2xl border border-[var(--hairline)] bg-graphite-950/40 p-4 pt-11 sm:p-5 sm:pt-11">
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Удалить ${label}`}
        title={`Удалить ${label}`}
        className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full text-paper-faint transition-colors hover:bg-danger/15 hover:text-danger"
      >
        <X className="size-4" />
      </button>
      {children}
    </div>
  );
}

function AddButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <Button variant="outline" size="sm" className="mt-4" onClick={onClick} disabled={disabled} icon={<Plus />}>
      {children}
    </Button>
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
