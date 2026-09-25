'use client';

import { NotificationToggle } from '@/components/account/NotificationToggle';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock3, ExternalLink, Plus, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { PhotoUpload } from '@/components/forms/PhotoUpload';
import { VideoUpload } from '@/components/forms/VideoUpload';
import { companyProfileSchema } from '@/lib/company';
import { normalizeInn } from '@/lib/inn';
import { durations, easeOutExpo } from '@/lib/motion';
import type { LinkItem, ModerationStatus } from '@/lib/types';

/** Те же пределы, что в lib/company.ts */
const LIMITS = { socials: 8, photos: 6 } as const;

export interface CompanyFormState {
  companyName: string;
  contactName: string;
  phone: string;
  inn: string;
  logoUrl: string | null;
  about: string;
  website: string;
  city: string;
  socials: LinkItem[];
  photos: string[];
  videoUrl: string;
}

/**
 * Страница своей компании.
 *
 * Статус модерации — первым блоком, до формы: компания, которая не знает,
 * что её ещё не видят студенты, решит, что платформа не работает, когда
 * откликов не будет.
 */
export function CompanyEditor({
  initial,
  companyId,
  moderation,
  selfRegistered,
  crmLink,
}: {
  initial: CompanyFormState;
  companyId: string;
  moderation: { status: ModerationStatus; note: string | null };
  /** Зарегистрировалась сама, а не пришла из CRM — смена названия вернёт на проверку */
  selfRegistered: boolean;
  /** Объединена ли страница с профилем в CRM — и если нет, что с заявкой на это. */
  crmLink: { linked: true } | { linked: false; requestedAt: string | null; note: string | null };
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  function patch(values: Partial<CompanyFormState>) {
    setForm((current) => ({ ...current, ...values }));
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
      about: form.about || null,
      website: form.website || null,
      city: form.city || null,
      videoUrl: form.videoUrl || null,
      phone: form.phone || null,
      // ИНН проверенной компании не меняется — и не отправляется
      inn: moderation.status === 'APPROVED' || !form.inn ? undefined : form.inn,
    };

    const parsed = companyProfileSchema.safeParse(payload);
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

    setSaving(true);
    try {
      const response = await fetch('/api/employer/company', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        error?: string;
        fields?: Record<string, string>;
        moderationStatus?: ModerationStatus;
      };
      if (!response.ok) {
        if (data.fields) setErrors(data.fields);
        toast.error(data.error ?? 'Не удалось сохранить');
        return;
      }
      setSaved(form);
      toast.success(
        'Страница компании сохранена',
        data.moderationStatus === 'PENDING' && moderation.status === 'APPROVED'
          ? 'Название изменилось — компания снова на проверке агентства'
          : data.moderationStatus === 'PENDING' && moderation.status === 'REJECTED'
            ? 'Страница снова отправлена на проверку агентству'
            : undefined,
      );
      router.refresh();
    } catch {
      toast.error('Сеть недоступна', 'Проверьте соединение и попробуйте ещё раз');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[42rem] pb-28">
      <header className="mb-8">
        <h1 className="text-display-md text-paper">Страница компании</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-paper-dim">
          Её видит студент, прежде чем откликнуться. Живое описание и фото команды
          работают сильнее, чем строка «динамично развивающаяся компания».
        </p>
      </header>

      <ModerationBanner status={moderation.status} note={moderation.note} companyId={companyId} />
      {crmLink.linked ? (
        <CrmEnterPanel />
      ) : (
        <CrmLinkPanel requestedAt={crmLink.requestedAt} note={crmLink.note} />
      )}

      <div className="mt-8 space-y-8">
        <Section title="Логотип">
          <PhotoUpload
            kind="company"
            value={form.logoUrl}
            name={form.companyName || 'Компания'}
            onChange={(logoUrl) => patch({ logoUrl })}
          />
          {errors.logoUrl && <p className="pt-2 text-[12.5px] text-danger">{errors.logoUrl}</p>}
        </Section>

        <Section title="О компании">
          <div className="space-y-5">
            <TextField
              label="Название компании"
              autoComplete="organization"
              value={form.companyName}
              error={errors.companyName}
              hint={
                selfRegistered && moderation.status === 'APPROVED'
                  ? 'После смены названия компания снова пройдёт проверку агентства'
                  : undefined
              }
              onChange={(e) => patch({ companyName: e.target.value })}
            />
            <TextField
              label="Город"
              value={form.city}
              error={errors.city}
              onChange={(e) => patch({ city: e.target.value })}
            />
            <TextAreaField
              label="Коротко о компании"
              value={form.about}
              maxCount={1500}
              error={errors.about}
              hint="Чем занимаетесь, где работаете, кого ищете среди студентов."
              onChange={(e) => patch({ about: e.target.value })}
            />
          </div>
        </Section>

        <Section title="Фото">
          <p className="mb-4 text-[13px] leading-relaxed text-paper-faint">
            Офис, команда, рабочее место — до {LIMITS.photos} фото.
          </p>
          {errors.photos && <p className="mb-3 text-[12.5px] text-danger">{errors.photos}</p>}
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
          {form.photos.length < LIMITS.photos && (
            // key меняется после каждого добавления: компонент загрузки держит
            // превью у себя, и без пересоздания показывал бы прошлое фото
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
        </Section>

        <Section title="Сайт, соцсети и видео">
          <div className="space-y-5">
            <TextField
              label="Сайт"
              type="url"
              inputMode="url"
              value={form.website}
              error={errors.website}
              hint="https://…"
              onChange={(e) => patch({ website: e.target.value })}
            />

            {errors.socials && <p className="text-[12.5px] text-danger">{errors.socials}</p>}
            {form.socials.map((link, i) => (
              <div
                key={i}
                className="relative grid gap-3 rounded-2xl border border-[var(--hairline)] bg-graphite-950/40 p-4 pt-11 sm:grid-cols-[9rem_1fr] sm:p-5 sm:pt-11"
              >
                <button
                  type="button"
                  onClick={() => patch({ socials: form.socials.filter((_, j) => j !== i) })}
                  aria-label="Удалить ссылку"
                  className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full text-paper-faint transition-colors hover:bg-danger/15 hover:text-danger"
                >
                  <X className="size-4" />
                </button>
                <TextField
                  label="Подпись"
                  value={link.label}
                  error={errors[`socials.${i}.label`]}
                  onChange={(e) =>
                    patch({ socials: form.socials.map((s, j) => (j === i ? { ...s, label: e.target.value } : s)) })
                  }
                />
                <TextField
                  label="Ссылка"
                  type="url"
                  inputMode="url"
                  value={link.url}
                  error={errors[`socials.${i}.url`]}
                  onChange={(e) =>
                    patch({ socials: form.socials.map((s, j) => (j === i ? { ...s, url: e.target.value } : s)) })
                  }
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              icon={<Plus />}
              disabled={form.socials.length >= LIMITS.socials}
              onClick={() => patch({ socials: [...form.socials, { label: '', url: '' }] })}
            >
              Добавить соцсеть
            </Button>

            <div className="space-y-3">
              {!form.videoUrl.startsWith('/api/files/companyVideo/') && (
                <TextField
                  label="Видео о компании"
                  type="url"
                  inputMode="url"
                  value={form.videoUrl}
                  error={errors.videoUrl}
                  hint="Необязательно. Ссылка на VK Видео, YouTube, Яндекс Диск — или загрузите файл ниже."
                  onChange={(e) => patch({ videoUrl: e.target.value })}
                />
              )}
              <VideoUpload kind="companyVideo" value={form.videoUrl} onChange={(url) => patch({ videoUrl: url })} />
            </div>
          </div>
        </Section>

        <Section title="Контактное лицо и реквизиты">
          <div className="space-y-5">
            <TextField
              label="Кто ведёт кабинет"
              autoComplete="name"
              value={form.contactName}
              error={errors.contactName}
              hint="Видит только агентство. На странице компании не показывается."
              onChange={(e) => patch({ contactName: e.target.value })}
            />
            <TextField
              label="Телефон для связи"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              error={errors.phone}
              hint="По нему агентство подтверждает компанию. Студентам не показывается."
              onChange={(e) => patch({ phone: e.target.value })}
            />
            {selfRegistered && (
              <TextField
                label="ИНН"
                inputMode="numeric"
                maxLength={12}
                value={form.inn}
                error={errors.inn}
                disabled={moderation.status === 'APPROVED'}
                hint={
                  moderation.status === 'APPROVED'
                    ? 'Компания проверена по этому ИНН. Если он неверный — напишите в агентство.'
                    : '10 цифр у организации, 12 у ИП.'
                }
                onChange={(e) => patch({ inn: normalizeInn(e.target.value).slice(0, 12) })}
              />
            )}
          </div>
        </Section>

        <Section title="Уведомления">
          <NotificationToggle audience="company" bordered={false} />
        </Section>
      </div>

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

function ModerationBanner({
  status,
  note,
  companyId,
}: {
  status: ModerationStatus;
  note: string | null;
  companyId: string;
}) {
  if (status === 'APPROVED') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-yes/30 bg-yes/[0.08] p-4">
        <p className="flex items-center gap-2 text-[13.5px] text-paper">
          <ShieldCheck className="size-4 shrink-0 text-yes-glow" aria-hidden />
          Страница опубликована — её видят студенты.
        </p>
        <Link
          href={`/companies/${companyId}`}
          className="inline-flex items-center gap-1.5 text-[13px] text-paper/80 underline-offset-4 hover:text-paper hover:underline"
        >
          Открыть как студент
          <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      </div>
    );
  }
  if (status === 'REJECTED') {
    return (
      <div className="rounded-2xl border border-danger/35 bg-danger/[0.07] p-4 text-[13.5px] leading-relaxed">
        <p className="flex items-center gap-2 font-medium text-danger">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          Агентство не одобрило компанию
        </p>
        {note && <p className="mt-1.5 text-paper-dim">{note}</p>}
        <p className="mt-1.5 text-paper-faint">Поправьте страницу и сохраните — она снова уйдёт на проверку.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-warn/35 bg-warn/[0.08] p-4 text-[13.5px] leading-relaxed">
      <p className="flex items-center gap-2 font-medium text-warn">
        <Clock3 className="size-4 shrink-0" aria-hidden />
        Компания на проверке у агентства
      </p>
      <p className="mt-1.5 text-paper-dim">
        Пока студенты не видят ни страницу, ни вакансии. Заполните страницу сейчас — после
        одобрения она появится сразу целиком.
      </p>
    </div>
  );
}

/** Страница объединена с профилем в CRM — переход туда тем же паролем. */
function CrmEnterPanel() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--hairline)] bg-graphite-950/40 p-4">
      <div>
        <p className="text-[13.5px] font-medium text-paper">Профиль объединён с CRM агентства</p>
        <p className="mt-1 text-[12.5px] text-paper-dim">Тот же вход, без второго пароля.</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        icon={<ExternalLink />}
        onClick={() => {
          window.location.href = '/api/employer/crm-enter';
        }}
      >
        Войти в CRM
      </Button>
    </div>
  );
}

/**
 * Заявка «у нас уже есть профиль в CRM, объедините» — для компаний,
 * зарегистрированных здесь самостоятельно. Решает её сотрудник CRM;
 * здесь только отправка и то, что видно, пока решения нет.
 */
function CrmLinkPanel({ requestedAt, note }: { requestedAt: string | null; note: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);

  if (requestedAt || justSent) {
    return (
      <div className="rounded-2xl border border-accent-400/35 bg-accent-500/[0.08] p-4 text-[13.5px] leading-relaxed">
        <p className="flex items-center gap-2 font-medium text-accent-200">
          <Clock3 className="size-4 shrink-0" aria-hidden />
          Заявка на объединение с CRM на рассмотрении
        </p>
        <p className="mt-1.5 text-paper-dim">Сотрудник агентства свяжет профили — обычно это быстро.</p>
      </div>
    );
  }

  async function send() {
    setSending(true);
    try {
      const response = await fetch('/api/employer/crm-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: text.trim() || undefined }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? 'Не удалось отправить заявку');
        return;
      }
      setJustSent(true);
      toast.success('Заявка отправлена');
      router.refresh();
    } catch {
      toast.error('Сеть недоступна', 'Проверьте соединение и попробуйте ещё раз');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--hairline)] bg-graphite-950/40 p-4">
      <p className="text-[13.5px] font-medium text-paper">Уже работаете с нами через CRM?</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-paper-dim">
        Оставьте заявку — агентство объединит эту страницу с вашим профилем в CRM, данные заполнять
        заново не придётся.
      </p>
      {note && (
        <p className="mt-3 rounded-xl border border-warn/30 bg-warn/[0.08] p-3 text-[12.5px] leading-relaxed text-warn">
          По прошлой заявке: {note}
        </p>
      )}
      <TextField
        label="Комментарий"
        value={text}
        hint="Необязательно. Например, с кем из агентства уже общались."
        onChange={(e) => setText(e.target.value)}
        className="mt-3"
      />
      <Button size="sm" className="mt-3" loading={sending} onClick={() => void send()}>
        Оставить заявку
      </Button>
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
