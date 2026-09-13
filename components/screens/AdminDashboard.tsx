'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, RefreshCw, ScrollText, ShieldAlert } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ApplicationStatusPill, StudentStatusPill } from '@/components/ui/StatusPill';
import { useToast } from '@/components/ui/Toast';
import { CountUp } from '@/components/motion/CountUp';
import { Reveal, Stagger } from '@/components/motion/Reveal';
import { BarList, ShareBar, type BarItem } from './admin/BarList';
import { durations, easeOutExpo, fadeUp, springSoft } from '@/lib/motion';
import { cn, formatDateTime, plural, timeAgo } from '@/lib/utils';
import {
  APPLICATION_FUNNEL,
  APPLICATION_STATUS_LABEL,
  STUDENT_STATUSES,
  STUDENT_STATUS_LABEL,
  type AdminStats,
  type AuditEntryDTO,
  type SyncRunDTO,
} from '@/lib/types';

/**
 * Панель HR-менеджера.
 *
 * Отвечает на два вопроса: кто сейчас в работе и живы ли данные. Всё
 * остальное — контекст. Поэтому «в процессе» стоит выше графиков:
 * именно там лежат люди, которых можно потерять, если не позвонить.
 */
export function AdminDashboard({
  stats,
  runs,
  audit,
}: {
  stats: AdminStats;
  runs: SyncRunDTO[];
  audit: AuditEntryDTO[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);
  const [history, setHistory] = useState(runs);

  async function runSync() {
    setSyncing(true);
    try {
      const response = await fetch('/api/admin/sync', { method: 'POST' });
      const data = (await response.json()) as { run?: SyncRunDTO; error?: string };

      if (data.run) setHistory((current) => [data.run as SyncRunDTO, ...current].slice(0, 8));

      if (!response.ok || data.run?.status === 'FAILED') {
        toast.error('Синхронизация не прошла', data.run?.error ?? data.error);
        return;
      }

      toast.success(
        'Синхронизация завершена',
        `Создано ${data.run?.created ?? 0}, обновлено ${data.run?.updated ?? 0}, снято ${data.run?.deactivated ?? 0}`,
      );
      router.refresh();
    } catch {
      toast.error('Сеть недоступна', 'Проверьте соединение и повторите');
    } finally {
      setSyncing(false);
    }
  }

  const funnelItems: BarItem[] = APPLICATION_FUNNEL.map((status) => ({
    key: status,
    label: APPLICATION_STATUS_LABEL[status],
    value: stats.applications.byStatus[status],
    tone: status === 'HIRED' ? 'good' : 'default',
  }));
  funnelItems.push({
    key: 'REJECTED',
    label: APPLICATION_STATUS_LABEL.REJECTED,
    value: stats.applications.byStatus.REJECTED,
    tone: 'muted',
  });

  const studentItems: BarItem[] = STUDENT_STATUSES.map((status) => ({
    key: status,
    label: STUDENT_STATUS_LABEL[status],
    value: stats.students.byStatus[status],
    tone: status === 'PLACED' ? 'good' : status === 'PAUSED' ? 'muted' : 'default',
  }));

  const verifiedTotal = stats.institutions.reduce((sum, row) => sum + row.verified, 0);

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow uppercase text-accent-300">HR-менеджер</p>
          <h1 className="mt-3 text-display-md text-paper">Панель управления</h1>
          <p className="mt-2.5 text-[14px] text-paper-dim">
            {stats.lastSync
              ? `Последняя синхронизация с CRM — ${timeAgo(stats.lastSync.startedAt)}`
              : 'Синхронизация с CRM ещё не запускалась'}
          </p>
        </div>

        <Button
          size="lg"
          variant="outline"
          loading={syncing}
          onClick={() => void runSync()}
          icon={<RefreshCw className={cn(syncing && 'animate-spin')} />}
        >
          {syncing ? 'Синхронизируем…' : 'Синхронизировать вакансии'}
        </Button>
      </header>

      {/* ---------- МОДЕРАЦИЯ ---------- */}
      {stats.moderation.companies + stats.moderation.vacancies > 0 && (
        <Link
          href="/admin/moderation"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warn/35 bg-warn/[0.08] p-4 transition-colors hover:bg-warn/[0.12]"
        >
          <span className="flex items-center gap-2 text-[13.5px] text-paper">
            <ShieldAlert className="size-4 shrink-0 text-warn" aria-hidden />
            Ждут проверки: {stats.moderation.companies}{' '}
            {plural(stats.moderation.companies, 'компания', 'компании', 'компаний')},{' '}
            {stats.moderation.vacancies} {plural(stats.moderation.vacancies, 'вакансия', 'вакансии', 'вакансий')}
          </span>
          <span className="text-[13px] text-paper/80">Открыть очередь →</span>
        </Link>
      )}

      {/* ---------- KPI ---------- */}
      <Stagger className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-[var(--hairline)] bg-[var(--hairline)] lg:grid-cols-4" inView={false}>
        <Kpi
          value={stats.students.total}
          label="студентов в базе"
          note={`+${stats.students.newThisWeek} за неделю`}
        />
        <Kpi value={stats.applications.total} label="откликов всего" note={`${stats.swipes.total} решений в ленте`} />
        <Kpi value={stats.applications.conversion} suffix="%" label="доходят до выхода" />
        <Kpi
          value={stats.vacancies.active}
          label="активных вакансий"
          note={`${stats.vacancies.total} всего в базе`}
        />
      </Stagger>

      {/* ---------- КТО В ПРОЦЕССЕ ---------- */}
      <section className="mt-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-display-sm text-paper">Кто в процессе</h2>
          <span className="text-[13px] text-paper-faint">
            {stats.inProgress.length}{' '}
            {plural(stats.inProgress.length, 'человек', 'человека', 'человек')} между просмотром и
            выходом
          </span>
        </div>

        {stats.inProgress.length === 0 ? (
          <div className="surface rounded-3xl px-6 py-12 text-center">
            <p className="text-[14.5px] text-paper-dim">
              Сейчас никто не находится в активной стадии отбора.
            </p>
          </div>
        ) : (
          <div className="surface overflow-hidden rounded-3xl">
            <Stagger className="divide-y divide-[var(--hairline)]" each={0.045} inView={false}>
              {stats.inProgress.map((row) => (
                <Reveal key={`${row.studentId}-${row.vacancyTitle}`} variants={fadeUp}>
                  <div className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper/[0.02]">
                    <Avatar name={row.fullName} src={row.photoUrl} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-medium text-paper">{row.fullName}</p>
                      <p className="truncate text-[12.5px] text-paper-faint">{row.university}</p>
                    </div>
                    <div className="hidden min-w-0 flex-1 sm:block">
                      <p className="truncate text-[13.5px] text-paper-dim">{row.vacancyTitle}</p>
                      <p className="truncate text-[12.5px] text-paper-faint">{row.company}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <ApplicationStatusPill status={row.status} />
                      <span className="text-[11.5px] text-paper-faint">{timeAgo(row.updatedAt)}</span>
                    </div>
                  </div>
                </Reveal>
              ))}
            </Stagger>
          </div>
        )}
      </section>

      {/* ---------- ПОКАЗАТЕЛИ ---------- */}
      <section className="mt-10 grid gap-4 lg:grid-cols-3">
        <Panel title="Воронка откликов" subtitle={`${stats.applications.total} всего`}>
          <BarList items={funnelItems} total={stats.applications.total} />
        </Panel>

        <Panel title="Студенты по статусам" subtitle={`${stats.students.total} в базе`}>
          <BarList
            items={studentItems}
            total={stats.students.total}
            unit={['студент', 'студента', 'студентов']}
          />
        </Panel>

        <Panel title="Решения в ленте" subtitle="Свайпы за всё время">
          <ShareBar
            label="Всего решений"
            filledLabel="Вправо"
            restLabel="Влево"
            filled={stats.swipes.right}
            rest={stats.swipes.left}
          />
          <p className="mt-6 text-[12.5px] leading-relaxed text-paper-faint">
            Доля свайпов вправо — качество подборки. Если она падает ниже 30%, лента показывает
            студентам не то: стоит проверить фильтры графика и города.
          </p>
        </Panel>
      </section>

      {/* ---------- УЧЕБНЫЕ ЗАВЕДЕНИЯ ---------- */}
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Студенты по учреждениям" subtitle="Из справочника вузов и вписанные вручную">
          {stats.institutions.length === 0 ? (
            <p className="text-[13.5px] text-paper-faint">Студентов пока нет.</p>
          ) : (
            <BarList
              items={stats.institutions.slice(0, 8).map((row) => ({
                key: row.id ?? 'OTHER',
                label: row.name,
                value: row.students,
                tone: row.id ? 'default' : 'muted',
              }))}
              total={stats.students.total}
              unit={['студент', 'студента', 'студентов']}
            />
          )}
        </Panel>

        <Panel title="Подтверждение учёбы" subtitle="Отметку ставит HR в разделе «Студенты»">
          <ShareBar
            label="Всего студентов"
            filledLabel="Подтверждена"
            restLabel="Не подтверждена"
            filled={verifiedTotal}
            rest={Math.max(0, stats.students.total - verifiedTotal)}
          />
          <Link
            href="/admin/students"
            className="mt-6 inline-flex text-[13px] text-paper/80 underline-offset-4 transition-colors hover:text-paper hover:underline"
          >
            Открыть список студентов →
          </Link>
        </Panel>
      </section>

      {/* ---------- СИНХРОНИЗАЦИЯ И ЖУРНАЛ ---------- */}
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="История синхронизаций" subtitle="Последние запуски">
          <AnimatePresence initial={false} mode="popLayout">
            {history.length === 0 ? (
              <p className="text-[13.5px] text-paper-faint">Запусков ещё не было.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((run) => (
                  <motion.li
                    key={run.id}
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={springSoft}
                    className="flex items-start gap-3 rounded-2xl border border-[var(--hairline)] bg-graphite-950/40 p-3.5"
                  >
                    <span
                      className={cn(
                        'mt-0.5 shrink-0',
                        run.status === 'SUCCESS' ? 'text-yes' : run.status === 'FAILED' ? 'text-danger' : 'text-paper-faint',
                      )}
                    >
                      {run.status === 'FAILED' ? (
                        <AlertTriangle className="size-4" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] text-paper">
                        {run.status === 'FAILED'
                          ? 'Сбой синхронизации'
                          : `Создано ${run.created} · обновлено ${run.updated} · снято ${run.deactivated}`}
                      </p>
                      <p className="mt-0.5 text-[12px] text-paper-faint">
                        {formatDateTime(run.startedAt)} · источник {run.source}
                      </p>
                      {run.error && (
                        <p className="mt-1.5 text-[12px] leading-snug text-danger">{run.error}</p>
                      )}
                    </div>
                  </motion.li>
                ))}
              </ul>
            )}
          </AnimatePresence>
        </Panel>

        <Panel
          title="Журнал обращений к данным"
          subtitle="Кто и что делал"
          icon={<ScrollText className="size-4" />}
        >
          {audit.length === 0 ? (
            <p className="text-[13.5px] text-paper-faint">Событий пока нет.</p>
          ) : (
            <ul className="max-h-[22rem] space-y-1.5 overflow-y-auto pr-1">
              {audit.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-baseline justify-between gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-paper/[0.03]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-paper-dim">{entry.action}</span>
                    <span className="block truncate text-[11.5px] text-paper-faint">
                      {entry.actorLabel}
                      {entry.ip ? ` · ${entry.ip}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-paper-faint">
                    {timeAgo(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </>
  );
}

function Kpi({
  value,
  label,
  note,
  suffix,
}: {
  value: number;
  label: string;
  note?: string;
  suffix?: string;
}) {
  return (
    <Reveal variants={fadeUp}>
      <div className="h-full bg-ink px-5 py-6 sm:px-6">
        <p className="text-[clamp(1.75rem,3vw,2.25rem)] font-semibold leading-none tracking-[-0.04em] text-paper">
          <CountUp to={value} suffix={suffix} />
        </p>
        <p className="mt-2.5 text-[13px] text-paper-dim">{label}</p>
        {note && <p className="mt-1 text-[11.5px] text-paper-faint">{note}</p>}
      </div>
    </Reveal>
  );
}

function Panel({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: durations.base, ease: easeOutExpo }}
      // min-w-0: элемент грида не сжимается ниже собственного контента,
      // и длинная подпись показателя распирает страницу на телефоне
      className="surface min-w-0 rounded-3xl p-5 sm:p-6"
    >
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em] text-paper">
            {icon}
            {title}
          </h3>
          {subtitle && <p className="mt-1 text-[12.5px] text-paper-faint">{subtitle}</p>}
        </div>
      </header>
      {children}
    </motion.section>
  );
}
