'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock3, MapPin, Send, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { VacancyStatusPill } from '@/components/ui/StatusPill';
import { useToast } from '@/components/ui/Toast';
import { PhotoUpload } from '@/components/forms/PhotoUpload';
import { VideoUpload } from '@/components/forms/VideoUpload';
import { SkillsInput } from '@/components/forms/SkillsInput';
import { cn } from '@/lib/utils';
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABEL,
  SALARY_PERIODS,
  SALARY_PERIOD_LABEL,
  WEEKDAYS,
  WEEKDAY_LABEL,
  WORK_FORMATS,
  WORK_FORMAT_LABEL,
  type EmploymentType,
  type ModerationStatus,
  type SalaryPeriod,
  type VacancyStatus,
  type WorkFormat,
} from '@/lib/types';
import {
  VACANCY_LIMITS,
  formToVacancyPayload,
  vacancyInputSchema,
  type CompanyAddress,
  type VacancyFormState,
} from '@/lib/vacancy';

const digits = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max);

const LINES_HINT = 'Каждый пункт — с новой строки.';

/**
 * Вакансия из кабинета компании.
 *
 * Поля — карточка вакансии v0.1 с доски Miro. Списки пишутся текстом, по
 * пункту на строку: на телефоне это быстрее, чем кнопка «добавить пункт»
 * у каждого, а сервер всё равно получает массив и проверяет каждый пункт.
 *
 * Кнопки — в конце формы, а не в плавающей панели: две кнопки в панели на
 * узком экране закрывали бы треть формы.
 */
export function VacancyEditor({
  vacancyId,
  status,
  moderationNote = null,
  initial,
  companyStatus,
  knownAddresses = [],
}: {
  vacancyId?: string;
  status?: VacancyStatus;
  moderationNote?: string | null;
  initial: VacancyFormState;
  companyStatus: ModerationStatus;
  /** Адреса прошлых вакансий компании — подставить в одно нажатие */
  knownAddresses?: CompanyAddress[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<'save' | 'submit' | null>(null);

  const isNew = !vacancyId;
  const current: VacancyStatus = status ?? 'DRAFT';

  function patch(values: Partial<VacancyFormState>) {
    setForm((prev) => ({ ...prev, ...values }));
    setErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      for (const key of Object.keys(values)) {
        for (const errorKey of Object.keys(next)) {
          if (errorKey === key || errorKey.startsWith(`${key}.`)) delete next[errorKey];
        }
      }
      return next;
    });
  }

  /** Ошибка поля; у списков — с номером пункта, иначе непонятно, какая строка не так */
  function fieldError(name: keyof VacancyFormState): string | undefined {
    if (errors[name]) return errors[name];
    const nested = Object.keys(errors).find((key) => key.startsWith(`${name}.`));
    if (!nested) return undefined;
    const index = Number(nested.split('.')[1]);
    return Number.isInteger(index) ? `Пункт ${index + 1}: ${errors[nested]}` : errors[nested];
  }

  async function save(submit: boolean) {
    const payload = formToVacancyPayload(form);
    const parsed = vacancyInputSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      toast.error('Проверьте поля, отмеченные красным');
      return;
    }

    setSaving(submit ? 'submit' : 'save');
    try {
      const response = await fetch(isNew ? '/api/employer/vacancies' : `/api/employer/vacancies/${vacancyId}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, submit }),
      });
      const data = (await response.json()) as {
        status?: VacancyStatus;
        error?: string;
        fields?: Record<string, string>;
      };
      if (!response.ok) {
        if (data.fields) setErrors(data.fields);
        toast.error(data.error ?? 'Не удалось сохранить вакансию');
        return;
      }

      if (data.status === 'PENDING') {
        toast.success('Вакансия на проверке', 'После одобрения агентством она появится в ленте студентов');
      } else {
        toast.success(data.status === 'DRAFT' ? 'Черновик сохранён' : 'Изменения сохранены');
      }
      router.push('/employer/vacancies');
      router.refresh();
    } catch {
      toast.error('Сеть недоступна', 'Проверьте соединение и попробуйте ещё раз');
    } finally {
      setSaving(null);
    }
  }

  const showSave = current !== 'PUBLISHED';
  const showSubmit = current !== 'PENDING';
  const saveLabel = isNew || current === 'DRAFT' ? 'Сохранить черновик' : 'Сохранить';
  const submitLabel = current === 'PUBLISHED' ? 'Сохранить и отправить на проверку' : 'Отправить на проверку';

  return (
    <div className="mx-auto w-full max-w-[46rem]">
      <Link
        href="/employer/vacancies"
        className="inline-flex items-center gap-1.5 text-[13px] text-paper-faint transition-colors hover:text-paper"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Все вакансии
      </Link>

      <header className="mb-8 mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-display-md text-paper">{isNew ? 'Новая вакансия' : 'Вакансия'}</h1>
          {!isNew && <VacancyStatusPill status={current} />}
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-paper-dim">
          Агентство проверяет каждую вакансию перед публикацией. Чем конкретнее задачи и условия,
          тем точнее лента подберёт студентов.
        </p>
      </header>

      <div className="space-y-3">
        {companyStatus !== 'APPROVED' && (
          <Notice tone="warn" icon={<Clock3 />} title={companyStatus === 'PENDING' ? 'Компания на проверке' : 'Компания не одобрена'}>
            {companyStatus === 'PENDING'
              ? 'Вакансию можно подготовить и отправить — студенты увидят её после одобрения компании.'
              : 'Пока компания не одобрена, вакансии не публикуются. Подробности — в разделе «Компания».'}
          </Notice>
        )}
        {current === 'REJECTED' && (
          <Notice tone="danger" icon={<TriangleAlert />} title="Агентство вернуло вакансию">
            {moderationNote ?? 'Поправьте вакансию и отправьте на проверку снова.'}
          </Notice>
        )}
        {current === 'PUBLISHED' && (
          <Notice tone="warn" icon={<TriangleAlert />} title="Вакансия опубликована">
            После сохранения она уйдёт на повторную проверку и пропадёт из ленты до одобрения.
          </Notice>
        )}
        {current === 'PENDING' && (
          <Notice tone="info" icon={<Clock3 />} title="На проверке у агентства">
            Изменения можно вносить — агентство проверит последнюю версию.
          </Notice>
        )}
      </div>

      <div className="mt-8 space-y-6">
        <Section title="Главное">
          <div className="space-y-5">
            <TextField
              label="Должность"
              value={form.title}
              maxLength={120}
              error={fieldError('title')}
              onChange={(e) => patch({ title: e.target.value })}
            />
            <TextAreaField
              label="Коротко о вакансии"
              value={form.summary}
              maxCount={1500}
              error={fieldError('summary')}
              hint="Что за работа и почему она подойдёт студенту — два-три предложения."
              onChange={(e) => patch({ summary: e.target.value })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Тип занятости"
                value={form.employmentType}
                options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: EMPLOYMENT_TYPE_LABEL[t] }))}
                error={fieldError('employmentType')}
                onChange={(e) => patch({ employmentType: e.target.value as EmploymentType })}
              />
              <SelectField
                label="Формат работы"
                value={form.workFormat}
                options={WORK_FORMATS.map((f) => ({ value: f, label: WORK_FORMAT_LABEL[f] }))}
                error={fieldError('workFormat')}
                onChange={(e) => patch({ workFormat: e.target.value as WorkFormat })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Город"
                value={form.city}
                error={fieldError('city')}
                onChange={(e) => patch({ city: e.target.value })}
              />
              <TextField
                label="Район или метро"
                value={form.district}
                error={fieldError('district')}
                hint="Необязательно"
                onChange={(e) => patch({ district: e.target.value })}
              />
            </div>
            {knownAddresses.length > 0 && (
              <div>
                <p className="mb-2 pl-1 text-[12.5px] text-paper-faint">Адреса ваших вакансий — нажмите, чтобы подставить:</p>
                <div className="flex flex-wrap gap-2">
                  {knownAddresses.map((item) => (
                    <Chip
                      key={[item.city, item.address, item.addressDetails ?? ''].join('|')}
                      size="sm"
                      selected={
                        form.city === item.city && form.address === item.address && form.addressDetails === (item.addressDetails ?? '')
                      }
                      onToggle={() =>
                        patch({
                          city: item.city,
                          district: item.district ?? '',
                          address: item.address,
                          addressDetails: item.addressDetails ?? '',
                        })
                      }
                    >
                      <MapPin className="size-3.5" aria-hidden />
                      {item.address}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
              <TextField
                label="Улица и дом"
                autoComplete="street-address"
                value={form.address}
                error={fieldError('address')}
                hint={
                  form.workFormat === 'REMOTE'
                    ? 'Для удалённой работы необязательно'
                    : 'Например: ул. Баумана, 44. Студент увидит адрес и ссылку на карту.'
                }
                onChange={(e) => patch({ address: e.target.value })}
              />
              <TextField
                label="Офис, этаж, вход"
                value={form.addressDetails}
                error={fieldError('addressDetails')}
                hint="Необязательно"
                onChange={(e) => patch({ addressDetails: e.target.value })}
              />
            </div>
          </div>
        </Section>

        <Section title="Оплата и график">
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField
                label="Оплата от, ₽"
                inputMode="numeric"
                value={form.salaryFrom}
                error={fieldError('salaryFrom')}
                onChange={(e) => patch({ salaryFrom: digits(e.target.value, 8) })}
              />
              <TextField
                label="Оплата до, ₽"
                inputMode="numeric"
                value={form.salaryTo}
                error={fieldError('salaryTo')}
                onChange={(e) => patch({ salaryTo: digits(e.target.value, 8) })}
              />
              <SelectField
                label="За период"
                value={form.salaryPeriod}
                options={SALARY_PERIODS.map((p) => ({ value: p, label: SALARY_PERIOD_LABEL[p] }))}
                onChange={(e) => patch({ salaryPeriod: e.target.value as SalaryPeriod })}
              />
            </div>
            <p className="-mt-3 pl-1 text-[12.5px] text-paper-faint">
              Оставьте пустым, если оплата обсуждается на собеседовании.
            </p>

            <div>
              <p className="mb-2.5 pl-1 text-[12.5px] uppercase tracking-[0.1em] text-paper-faint">Дни смен</p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => {
                  const selected = form.shiftDays.includes(day);
                  return (
                    <Chip
                      key={day}
                      size="sm"
                      selected={selected}
                      onToggle={() =>
                        patch({
                          shiftDays: selected ? form.shiftDays.filter((d) => d !== day) : [...form.shiftDays, day],
                        })
                      }
                    >
                      {WEEKDAY_LABEL[day]}
                    </Chip>
                  );
                })}
              </div>
              {fieldError('shiftDays') && (
                <p className="pl-1 pt-1.5 text-[12.5px] text-danger">{fieldError('shiftDays')}</p>
              )}
            </div>

            <TextField
              label="Часов в неделю"
              inputMode="numeric"
              value={form.hoursPerWeek}
              error={fieldError('hoursPerWeek')}
              hint="Необязательно. От 4 до 60 — лента сверяет нагрузку с тем, сколько готов работать студент."
              onChange={(e) => patch({ hoursPerWeek: digits(e.target.value, 2) })}
            />
          </div>
        </Section>

        <Section title="Кандидату">
          <div className="space-y-5">
            <TextAreaField
              label="Что нужно от кандидата"
              value={form.requirements}
              rows={4}
              error={fieldError('requirements')}
              hint={`${LINES_HINT} Необязательно.`}
              onChange={(e) => patch({ requirements: e.target.value })}
            />
            <TextAreaField
              label="Условия и бонусы"
              value={form.perks}
              rows={4}
              error={fieldError('perks')}
              hint={`${LINES_HINT} Например: обучение, питание, гибкий график.`}
              onChange={(e) => patch({ perks: e.target.value })}
            />
            <TextAreaField
              label="Чему научится студент"
              value={form.learnings}
              rows={4}
              error={fieldError('learnings')}
              hint={`${LINES_HINT} Для студента это часто важнее оплаты.`}
              onChange={(e) => patch({ learnings: e.target.value })}
            />
          </div>
        </Section>

        <Section title="Навыки">
          <p className="mb-4 text-[13px] leading-relaxed text-paper-faint">
            По этим тегам лента поднимает вакансию студентам с такими навыками. До {VACANCY_LIMITS.tags}.
          </p>
          <SkillsInput value={form.tags} max={VACANCY_LIMITS.tags} onChange={(tags) => patch({ tags })} />
          {fieldError('tags') && <p className="pt-2 text-[12.5px] text-danger">{fieldError('tags')}</p>}
        </Section>

        <Section title="Фото и видео">
          <p className="mb-4 text-[13px] leading-relaxed text-paper-faint">
            Рабочее место, команда, смена — до {VACANCY_LIMITS.photos} фото.
          </p>
          {fieldError('photos') && <p className="mb-3 text-[12.5px] text-danger">{fieldError('photos')}</p>}
          {form.photos.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {form.photos.map((src, i) => (
                <div
                  key={src}
                  className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--hairline)]"
                >
                  <Image src={src} alt={`Фото ${i + 1}`} fill unoptimized sizes="200px" className="object-cover" />
                  <button
                    type="button"
                    onClick={() => patch({ photos: form.photos.filter((p) => p !== src) })}
                    aria-label={`Удалить фото ${i + 1}`}
                    className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-ink/70 text-paper/80 backdrop-blur transition-colors hover:bg-danger/80 hover:text-paper"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {form.photos.length < VACANCY_LIMITS.photos && (
            // key меняется после каждого добавления: компонент загрузки держит
            // превью у себя и без пересоздания показывал бы прошлое фото
            <PhotoUpload
              key={form.photos.length}
              kind="company"
              value={null}
              name="Фото"
              onChange={(url) => {
                if (url) patch({ photos: [...form.photos, url] });
              }}
            />
          )}
          <div className="mt-5 space-y-3">
            {!form.videoUrl.startsWith('/api/files/companyVideo/') && (
              <TextField
                label="Видео о работе"
                type="url"
                inputMode="url"
                value={form.videoUrl}
                error={fieldError('videoUrl')}
                hint="Необязательно. Ссылка на VK Видео, YouTube, Яндекс Диск — или загрузите файл ниже."
                onChange={(e) => patch({ videoUrl: e.target.value })}
              />
            )}
            <VideoUpload kind="companyVideo" value={form.videoUrl} onChange={(url) => patch({ videoUrl: url })} />
          </div>
        </Section>
      </div>

      <div className="mt-8 flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-end">
        {showSave && (
          <Button
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            loading={saving === 'save'}
            disabled={saving !== null}
            onClick={() => void save(false)}
          >
            {saveLabel}
          </Button>
        )}
        {showSubmit && (
          <Button
            variant="accent"
            size="lg"
            className="w-full sm:w-auto"
            icon={<Send />}
            loading={saving === 'submit'}
            disabled={saving !== null}
            onClick={() => void save(true)}
          >
            {submitLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

function Notice({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'warn' | 'danger' | 'info';
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4 text-[13.5px] leading-relaxed',
        tone === 'warn' && 'border-warn/35 bg-warn/[0.08]',
        tone === 'danger' && 'border-danger/35 bg-danger/[0.07]',
        tone === 'info' && 'border-accent-400/30 bg-accent-500/[0.08]',
      )}
    >
      <p
        className={cn(
          'flex items-center gap-2 font-medium',
          tone === 'warn' && 'text-warn',
          tone === 'danger' && 'text-danger',
          tone === 'info' && 'text-accent-200',
        )}
      >
        <span className="shrink-0 [&>svg]:size-4" aria-hidden>
          {icon}
        </span>
        {title}
      </p>
      <p className="mt-1.5 whitespace-pre-line break-words text-paper-dim">{children}</p>
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
