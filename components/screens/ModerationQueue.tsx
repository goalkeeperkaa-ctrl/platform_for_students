'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Check, Eye, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextAreaField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { VacancyDetail } from '@/components/swipe/VacancyDetail';
import { formatSalary, plural, timeAgo } from '@/lib/utils';
import {
  EMPLOYMENT_TYPE_LABEL,
  MODERATION_STATUS_LABEL,
  type ModerationCompanyDTO,
  type ModerationStatus,
  type ModerationVacancyDTO,
  type VacancyDTO,
} from '@/lib/types';

type Entity = 'company' | 'vacancy';
type Decision = 'APPROVE' | 'REJECT';
type Decide = (decision: Decision, note?: string) => Promise<boolean>;

/**
 * Очередь модерации.
 *
 * Сначала компании, потом вакансии: вакансию неодобренной компании
 * одобрить нельзя — она всё равно не появилась бы в ленте. Кнопка у такой
 * вакансии выключена и объясняет почему, а не молчит.
 *
 * Отказ — только с причиной: компания видит её в кабинете, и без неё не
 * знает, что поправить.
 */
export function ModerationQueue({
  companies: initialCompanies,
  vacancies: initialVacancies,
}: {
  companies: ModerationCompanyDTO[];
  vacancies: ModerationVacancyDTO[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [companies, setCompanies] = useState(initialCompanies);
  const [vacancies, setVacancies] = useState(initialVacancies);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [preview, setPreview] = useState<VacancyDTO | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);

  async function decide(
    entity: Entity,
    id: string,
    decision: Decision,
    note?: string,
    version?: string,
  ): Promise<boolean> {
    setBusy((current) => new Set(current).add(id));
    try {
      const response = await fetch('/api/admin/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, id, decision, note, version }),
      });
      const data = (await response.json()) as { error?: string; fields?: Record<string, string> };
      if (!response.ok) {
        toast.error(data.fields?.note ?? data.error ?? 'Не удалось сохранить решение');
        return false;
      }

      if (entity === 'company') {
        const status: ModerationStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        setCompanies((list) => list.filter((c) => c.id !== id));
        setVacancies((list) => list.map((v) => (v.companyId === id ? { ...v, companyStatus: status } : v)));
      } else {
        setVacancies((list) => list.filter((v) => v.vacancy.id !== id));
      }
      toast.success(decision === 'APPROVE' ? 'Одобрено' : 'Отклонено — причина ушла в кабинет компании');
      // Счётчик в навигации считается на сервере
      router.refresh();
      return true;
    } catch {
      toast.error('Сеть недоступна', 'Проверьте соединение и попробуйте ещё раз');
      return false;
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  if (companies.length === 0 && vacancies.length === 0) {
    return (
      <>
        <Header />
        <EmptyState
          title="Очередь пуста"
          description="Новые компании и вакансии из кабинетов появятся здесь. До вашего решения студенты их не видят."
          action={
            <Link href="/admin">
              <Button variant="outline">На панель</Button>
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <Header />

      <section>
        <SectionTitle title="Компании" count={companies.length} />
        {companies.length === 0 ? (
          <p className="text-[13.5px] text-paper-faint">Новых компаний нет.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            {companies.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                busy={busy.has(company.id)}
                onDecide={(decision, note) => decide('company', company.id, decision, note)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <SectionTitle title="Вакансии" count={vacancies.length} />
        {vacancies.length === 0 ? (
          <p className="text-[13.5px] text-paper-faint">Новых вакансий нет.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            {vacancies.map((item) => (
              <VacancyCard
                key={item.vacancy.id}
                item={item}
                busy={busy.has(item.vacancy.id)}
                onPreview={() => setPreview(item.vacancy)}
                onDecide={(decision, note) => decide('vacancy', item.vacancy.id, decision, note, item.version)}
              />
            ))}
          </div>
        )}
      </section>

      <VacancyDetail vacancy={preview} onClose={closePreview} />
    </>
  );
}

function Header() {
  return (
    <header className="mb-8">
      <p className="text-eyebrow uppercase text-accent-300">HR-менеджер</p>
      <h1 className="mt-3 text-display-md text-paper">Модерация</h1>
      <p className="mt-2.5 max-w-[60ch] text-[14px] leading-relaxed text-paper-dim">
        Компании, которые зарегистрировались сами, и вакансии из их кабинетов. До вашего решения
        студенты не видят ни то, ни другое.
      </p>
    </header>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <h2 className="text-display-sm text-paper">{title}</h2>
      <span className="text-[13px] tabular-nums text-paper-faint">{count}</span>
    </div>
  );
}

function CompanyCard({
  company,
  busy,
  onDecide,
}: {
  company: ModerationCompanyDTO;
  busy: boolean;
  onDecide: Decide;
}) {
  const website = company.website && /^https?:\/\//i.test(company.website) ? company.website : null;
  const meta = company.city ?? '';

  return (
    <article className="surface rounded-3xl p-5 sm:p-6">
      <div className="flex min-w-0 items-start gap-4">
        <Avatar name={company.companyName} src={company.logoUrl} size={52} rounded="square" />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-[16.5px] font-semibold tracking-[-0.02em] text-paper">
            {company.companyName}
          </h3>
          <p className="mt-1 text-[13px] text-paper-faint">{meta || 'Отрасль и город не указаны'}</p>
        </div>
        <span className="shrink-0 text-[12px] text-paper-faint">{timeAgo(company.createdAt)}</span>
      </div>

      <dl className="mt-4 space-y-1.5 text-[13.5px]">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-paper-faint">Контакт:</dt>
          <dd className="min-w-0 break-words text-paper-dim">{company.contactName}</dd>
        </div>
        {company.email && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-paper-faint">Почта:</dt>
            <dd className="min-w-0">
              <a
                href={`mailto:${company.email}`}
                className="break-all text-paper underline-offset-4 hover:underline"
              >
                {company.email}
              </a>
            </dd>
          </div>
        )}
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-paper-faint">ИНН:</dt>
          <dd className="min-w-0 break-words text-paper-dim">
            {company.inn ? (
              <>
                <span className="tabular-nums text-paper">{company.inn}</span>{' '}
                <a
                  href="https://egrul.nalog.ru/index.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-200 underline-offset-4 hover:underline"
                >
                  проверить в ФНС
                </a>
              </>
            ) : (
              'не указан'
            )}
          </dd>
        </div>
        {company.phone && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-paper-faint">Телефон:</dt>
            <dd className="min-w-0">
              <a
                href={'tel:' + company.phone.replace(/[^\d+]/g, '')}
                className="break-all text-paper underline-offset-4 hover:underline"
              >
                {company.phone}
              </a>
            </dd>
          </div>
        )}
        {website && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-paper-faint">Сайт:</dt>
            <dd className="min-w-0">
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="break-all text-paper underline-offset-4 hover:underline"
              >
                {website}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {(company.freeEmail || !company.inn) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {company.freeEmail && <Tag tone="hot">Почта не на домене компании</Tag>}
          {!company.inn && <Tag tone="hot">Нет ИНН</Tag>}
        </div>
      )}
      <p className="mt-3 text-[12.5px] leading-relaxed text-paper-faint">
        Сверьте ИНН на сайте ФНС: компания действующая, название совпадает. Если о компании ничего
        не нашлось — позвоните по телефону.
      </p>

      {company.about ? (
        <p className="mt-4 line-clamp-4 whitespace-pre-line break-words text-[14px] leading-relaxed text-paper-dim">
          {company.about}
        </p>
      ) : (
        <p className="mt-4 text-[13.5px] text-paper-faint">Страница компании пока не заполнена.</p>
      )}

      {company.pendingVacancies > 0 && (
        <p className="mt-3 text-[12.5px] text-paper-faint">
          На проверке {company.pendingVacancies}{' '}
          {plural(company.pendingVacancies, 'вакансия', 'вакансии', 'вакансий')} этой компании
        </p>
      )}

      <DecisionBar busy={busy} onDecide={onDecide} />
    </article>
  );
}

function VacancyCard({
  item,
  busy,
  onPreview,
  onDecide,
}: {
  item: ModerationVacancyDTO;
  busy: boolean;
  onPreview: () => void;
  onDecide: Decide;
}) {
  const { vacancy } = item;
  const companyReady = item.companyStatus === 'APPROVED';

  return (
    <article className="surface rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-[16.5px] font-semibold tracking-[-0.02em] text-paper">
            {vacancy.title}
          </h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-paper-dim">
            <Building2 className="size-3.5 shrink-0 text-paper-faint" aria-hidden />
            <span className="min-w-0 break-words">{vacancy.company}</span>
            {!companyReady && (
              <Tag tone="hot">Компания: {MODERATION_STATUS_LABEL[item.companyStatus].toLowerCase()}</Tag>
            )}
          </p>
        </div>
        <span className="shrink-0 text-[12px] text-paper-faint">{timeAgo(item.submittedAt)}</span>
      </div>

      <p className="mt-3 text-[14px] text-accent-200">
        {formatSalary(vacancy.salaryFrom, vacancy.salaryTo)}
        <span className="text-paper-faint">
          {' '}
          · {vacancy.city} · {EMPLOYMENT_TYPE_LABEL[vacancy.employmentType]}
        </span>
      </p>
      <p className="mt-3 line-clamp-3 break-words text-[14px] leading-relaxed text-paper-dim">{vacancy.summary}</p>

      <Button variant="ghost" size="sm" className="-ml-2 mt-3" icon={<Eye />} onClick={onPreview}>
        Открыть карточку, как у студента
      </Button>

      <DecisionBar
        busy={busy}
        approveBlockedReason={
          companyReady ? undefined : 'Сначала одобрите компанию — без неё вакансия студентам не видна.'
        }
        onDecide={onDecide}
      />
    </article>
  );
}

function DecisionBar({
  busy,
  approveBlockedReason,
  onDecide,
}: {
  busy: boolean;
  approveBlockedReason?: string;
  onDecide: Decide;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();

  async function reject() {
    if (note.trim().length < 5) {
      setError('Напишите причину — хотя бы пару слов');
      return;
    }
    const done = await onDecide('REJECT', note.trim());
    if (done) {
      setRejecting(false);
      setNote('');
    }
  }

  if (rejecting) {
    return (
      <div className="mt-5 space-y-3 border-t border-[var(--hairline)] pt-5">
        <TextAreaField
          label="Причина отказа"
          value={note}
          maxCount={500}
          error={error}
          hint="Компания увидит её в кабинете."
          onChange={(e) => {
            setNote(e.target.value);
            setError(undefined);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" size="sm" icon={<X />} loading={busy} onClick={() => void reject()}>
            Отклонить
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setRejecting(false);
              setError(undefined);
            }}
          >
            Отмена
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 border-t border-[var(--hairline)] pt-5">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="accent"
          size="sm"
          icon={<Check />}
          loading={busy}
          disabled={!!approveBlockedReason}
          onClick={() => void onDecide('APPROVE')}
        >
          Одобрить
        </Button>
        <Button variant="outline" size="sm" icon={<X />} disabled={busy} onClick={() => setRejecting(true)}>
          Отклонить
        </Button>
      </div>
      {approveBlockedReason && <p className="mt-2 text-[12.5px] text-paper-faint">{approveBlockedReason}</p>}
    </div>
  );
}
