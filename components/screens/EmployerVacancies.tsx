'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock3, Pencil, Plus, Send, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { VacancyStatusPill } from '@/components/ui/StatusPill';
import { useToast } from '@/components/ui/Toast';
import { plural, timeAgo } from '@/lib/utils';
import { EMPLOYMENT_TYPE_LABEL, type EmployerVacancyDTO, type ModerationStatus } from '@/lib/types';
import { SUBMITTABLE_STATUSES } from '@/lib/vacancy';

/** Что сейчас происходит с вакансией — словами, а не только цветом статуса. */
function statusHint(vacancy: EmployerVacancyDTO, companyStatus: ModerationStatus): string {
  if (vacancy.fromCrm) {
    return vacancy.status === 'CLOSED'
      ? 'Закрыта в CRM. Вакансии из CRM ведёт агентство.'
      : 'В ленте у студентов. Изменения вносит агентство через CRM.';
  }
  switch (vacancy.status) {
    case 'DRAFT':
      return 'Черновик — студенты его не видят. Когда будет готово, отправьте на проверку.';
    case 'PENDING':
      return 'Ждёт проверки агентством. После одобрения появится в ленте.';
    case 'PUBLISHED':
      return companyStatus === 'APPROVED'
        ? 'В ленте у студентов.'
        : 'Одобрена, но скрыта, пока компания на проверке.';
    case 'REJECTED':
      return 'Агентство вернуло вакансию. Поправьте и отправьте снова.';
    case 'CLOSED':
      return 'Снята с публикации. Можно поправить и отправить на проверку снова.';
  }
}

/**
 * Вакансии компании в кабинете.
 *
 * Статус каждой вакансии объяснён фразой: компания, которая видит
 * «на проверке» и не знает, что это значит, пишет в поддержку, а
 * компания, которая не видит причины отказа, — уходит.
 *
 * Снятие — в два нажатия: одно случайное касание на телефоне не должно
 * убирать вакансию из ленты.
 */
export function EmployerVacancies({
  vacancies,
  companyStatus,
}: {
  vacancies: EmployerVacancyDTO[];
  companyStatus: ModerationStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [closing, setClosing] = useState<string | null>(null);

  async function act(vacancy: EmployerVacancyDTO, action: 'submit' | 'close') {
    setBusy((current) => new Set(current).add(vacancy.id));
    try {
      const response = await fetch(`/api/employer/vacancies/${vacancy.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? 'Не удалось выполнить действие');
        return;
      }
      toast.success(action === 'close' ? 'Вакансия снята' : 'Вакансия на проверке', `«${vacancy.title}»`);
      setClosing(null);
      router.refresh();
    } catch {
      toast.error('Сеть недоступна', 'Проверьте соединение и попробуйте ещё раз');
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(vacancy.id);
        return next;
      });
    }
  }

  const newButton = (
    <Link href="/employer/vacancies/new">
      <Button variant="accent" icon={<Plus />}>
        Новая вакансия
      </Button>
    </Link>
  );

  return (
    <div className="mx-auto w-full max-w-[52rem]">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-eyebrow uppercase text-accent-300">Кабинет работодателя</p>
          <h1 className="mt-3 text-display-md text-paper">Вакансии</h1>
          <p className="mt-2.5 max-w-[52ch] text-[14px] leading-relaxed text-paper-dim">
            Агентство проверяет каждую вакансию перед публикацией в ленте студентов.
          </p>
        </div>
        {vacancies.length > 0 && newButton}
      </header>

      {companyStatus !== 'APPROVED' && (
        <div className="mb-6 rounded-2xl border border-warn/35 bg-warn/[0.08] p-4 text-[13.5px] leading-relaxed">
          <p className="flex items-center gap-2 font-medium text-warn">
            <Clock3 className="size-4 shrink-0" aria-hidden />
            {companyStatus === 'PENDING' ? 'Компания на проверке у агентства' : 'Компания не одобрена'}
          </p>
          <p className="mt-1.5 text-paper-dim">
            {companyStatus === 'PENDING'
              ? 'Вакансии можно готовить и отправлять на проверку — студенты увидят их после одобрения компании.'
              : 'Пока компания не одобрена, вакансии не публикуются. Подробности — в разделе «Компания».'}
          </p>
        </div>
      )}

      {vacancies.length === 0 ? (
        <EmptyState
          title="Вакансий пока нет"
          description="Создайте первую вакансию — после проверки агентством её увидят студенты в ленте."
          action={newButton}
        />
      ) : (
        <ul className="grid gap-3">
          {vacancies.map((vacancy) => {
            const isBusy = busy.has(vacancy.id);
            return (
              <li key={vacancy.id} className="surface min-w-0 rounded-3xl p-5">
                {/* На телефоне статус над названием: в одну строку с бейджами
                    название сжималось до столбика и рвалось посреди слова */}
                <div className="flex flex-col-reverse items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
                  <div className="min-w-0 sm:flex-1">
                    <h2 className="break-words text-[16.5px] font-semibold tracking-[-0.02em] text-paper">
                      {vacancy.title}
                    </h2>
                    <p className="mt-1 text-[13px] text-paper-faint">
                      {vacancy.city} · {EMPLOYMENT_TYPE_LABEL[vacancy.employmentType]} · {vacancy.applications}{' '}
                      {plural(vacancy.applications, 'отклик', 'отклика', 'откликов')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {vacancy.fromCrm && <Tag>Из CRM</Tag>}
                    <VacancyStatusPill status={vacancy.status} />
                  </div>
                </div>

                <p className="mt-3 text-[13.5px] leading-relaxed text-paper-dim">
                  {statusHint(vacancy, companyStatus)}
                </p>

                {vacancy.moderationNote && (
                  <p className="mt-2.5 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/[0.07] px-3 py-2.5 text-[13px] leading-relaxed text-paper-dim">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
                    <span className="min-w-0 break-words">
                      <span className="font-medium text-danger">Причина: </span>
                      {vacancy.moderationNote}
                    </span>
                  </p>
                )}

                {!vacancy.fromCrm &&
                  (closing === vacancy.id ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-4">
                      <span className="mr-1 text-[13px] text-paper-dim">
                        Закрыть вакансию? Студенты её не увидят, отклики сохранятся.
                      </span>
                      <Button variant="danger" size="sm" loading={isBusy} onClick={() => void act(vacancy, 'close')}>
                        Закрыть
                      </Button>
                      <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => setClosing(null)}>
                        Отмена
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-4">
                      <Link href={`/employer/vacancies/${vacancy.id}`}>
                        <Button variant="outline" size="sm" icon={<Pencil />}>
                          Изменить
                        </Button>
                      </Link>
                      {SUBMITTABLE_STATUSES.includes(vacancy.status) && (
                        <Button
                          variant="accent"
                          size="sm"
                          icon={<Send />}
                          loading={isBusy}
                          onClick={() => void act(vacancy, 'submit')}
                        >
                          Отправить на проверку
                        </Button>
                      )}
                      {vacancy.status !== 'CLOSED' && (
                        <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => setClosing(vacancy.id)}>
                          {vacancy.status === 'PUBLISHED' ? 'Снять с публикации' : 'Закрыть'}
                        </Button>
                      )}
                      <span className="ml-auto text-[12px] text-paper-faint">
                        Изменена {timeAgo(vacancy.updatedAt)}
                      </span>
                    </div>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
