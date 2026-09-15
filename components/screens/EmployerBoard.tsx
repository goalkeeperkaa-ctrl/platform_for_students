'use client';

import { PortfolioView } from '@/components/student/PortfolioView';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { ChevronDown, Download, GraduationCap, Mail, MessageSquare, Phone, ShieldCheck, Sparkles } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ApplicationStatusPill } from '@/components/ui/StatusPill';
import { useToast } from '@/components/ui/Toast';
import { Reveal, Stagger } from '@/components/motion/Reveal';
import { CountUp } from '@/components/motion/CountUp';
import { durations, easeOutExpo, fadeUp, springSoft, springSnappy } from '@/lib/motion';
import { cn, plural, timeAgo } from '@/lib/utils';
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABEL,
  WEEKDAY_LABEL,
  type ApplicationStatus,
  type EmployerApplicationDTO,
} from '@/lib/types';
import type { EmployerBoard as BoardData } from '@/lib/services';

/**
 * Кабинет работодателя.
 *
 * Классический список, а не свайпы: у компании десятки откликов и один
 * вопрос — «кого звать». Здесь нужны фото, факты и резюме в один экран,
 * а не по одному кандидату за жест.
 *
 * Контакты открыты сразу: студент сам откликнулся на эту вакансию, и
 * прятать телефон за лишним кликом означало бы только замедлить ответ.
 */
export function EmployerBoard({ board }: { board: BoardData }) {
  const toast = useToast();
  const [applications, setApplications] = useState(board.applications);
  const [vacancyFilter, setVacancyFilter] = useState<string | 'ALL'>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      vacancyFilter === 'ALL'
        ? applications
        : applications.filter((a) => a.vacancyId === vacancyFilter),
    [applications, vacancyFilter],
  );

  const fresh = applications.filter((a) => a.status === 'NEW').length;

  function toggle(application: EmployerApplicationDTO) {
    const opening = expanded !== application.id;
    setExpanded(opening ? application.id : null);
    // Первое открытие нового отклика — «просмотрен»: студент видит, что его заметили
    if (opening && application.status === 'NEW') void markViewed(application);
  }

  async function markViewed(application: EmployerApplicationDTO) {
    setApplications((current) =>
      current.map((a) =>
        a.id === application.id ? { ...a, status: 'VIEWED', statusChangedAt: new Date().toISOString() } : a,
      ),
    );
    try {
      const response = await fetch('/api/employer/applications/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: application.id }),
      });
      if (!response.ok) throw new Error();
    } catch {
      // Без тоста: просмотр — побочное действие. Статус возвращается, и
      // следующее открытие карточки повторит попытку
      setApplications((current) =>
        current.map((a) => (a.id === application.id ? { ...a, status: application.status } : a)),
      );
    }
  }

  async function changeStatus(application: EmployerApplicationDTO, status: ApplicationStatus) {
    const previous = application.status;
    setPending(application.id);
    setApplications((current) =>
      current.map((a) =>
        a.id === application.id ? { ...a, status, statusChangedAt: new Date().toISOString() } : a,
      ),
    );

    try {
      const response = await fetch('/api/employer/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: application.id, status }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error);
      toast.success('Статус обновлён', `${application.student.fullName} · ${APPLICATION_STATUS_LABEL[status]}`);
    } catch (error) {
      setApplications((current) =>
        current.map((a) => (a.id === application.id ? { ...a, status: previous } : a)),
      );
      toast.error('Не удалось сменить статус', error instanceof Error ? error.message : undefined);
    } finally {
      setPending(null);
    }
  }

  if (applications.length === 0) {
    return (
      <>
        <BoardHeader company={board.company} total={0} fresh={0} vacancies={board.vacancies.length} />
        <EmptyState
          title="Откликов пока нет"
          description="Как только студент смахнёт вашу вакансию вправо, его профиль появится здесь — с фото, контактами и резюме."
          action={
            <Link href="/employer/vacancies">
              <Button variant="accent" size="md">
                Мои вакансии
              </Button>
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <BoardHeader
        company={board.company}
        total={applications.length}
        fresh={fresh}
        vacancies={board.vacancies.length}
      />

      <div className="mb-6 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <FilterChip active={vacancyFilter === 'ALL'} onClick={() => setVacancyFilter('ALL')}>
          Все вакансии
          <Count>{applications.length}</Count>
        </FilterChip>
        {board.vacancies.map((vacancy) => (
          <FilterChip
            key={vacancy.id}
            active={vacancyFilter === vacancy.id}
            onClick={() => setVacancyFilter(vacancy.id)}
          >
            {vacancy.title}
            <Count>{vacancy.total}</Count>
          </FilterChip>
        ))}
      </div>

      <Stagger className="grid gap-3 [&>*]:min-w-0" each={0.05} inView={false}>
        {visible.map((application) => (
          <Reveal key={application.id} variants={fadeUp}>
            <CandidateRow
              application={application}
              expanded={expanded === application.id}
              pending={pending === application.id}
              onToggle={() => toggle(application)}
              onStatus={(status) => void changeStatus(application, status)}
            />
          </Reveal>
        ))}
      </Stagger>

      {visible.length === 0 && (
        <p className="py-16 text-center text-[14px] text-paper-faint">
          По этой вакансии откликов пока нет.
        </p>
      )}
    </>
  );
}

function BoardHeader({
  company,
  total,
  fresh,
  vacancies,
}: {
  company: string;
  total: number;
  fresh: number;
  vacancies: number;
}) {
  return (
    <header className="mb-8">
      <p className="text-eyebrow uppercase text-accent-300">Кабинет работодателя</p>
      <h1 className="mt-3 text-display-md text-paper">{company}</h1>

      <div className="mt-7 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--hairline)]">
        <Stat value={total} label={plural(total, 'отклик', 'отклика', 'откликов')} />
        <Stat value={fresh} label="новых" accent />
        <Stat value={vacancies} label={plural(vacancies, 'вакансия', 'вакансии', 'вакансий')} />
      </div>
    </header>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="bg-ink px-5 py-5">
      <p
        className={cn(
          'text-[26px] font-semibold leading-none tracking-[-0.03em]',
          accent && value > 0 ? 'text-accent-200' : 'text-paper',
        )}
      >
        <CountUp to={value} />
      </p>
      <p className="mt-2 text-[12.5px] text-paper-faint">{label}</p>
    </div>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1.5 rounded-full bg-paper/[0.09] px-1.5 py-0.5 text-[10.5px] tabular-nums">
      {children}
    </span>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      transition={springSnappy}
      className={cn(
        'relative flex shrink-0 items-center whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-medium transition-colors duration-300',
        active
          ? 'border-accent-400/55 bg-accent-500/20 text-paper'
          : 'border-[var(--hairline)] bg-graphite-900/45 text-paper/60 hover:border-paper/22 hover:text-paper',
      )}
    >
      {children}
    </motion.button>
  );
}

function CandidateRow({
  application,
  expanded,
  pending,
  onToggle,
  onStatus,
}: {
  application: EmployerApplicationDTO;
  expanded: boolean;
  pending: boolean;
  onToggle: () => void;
  onStatus: (status: ApplicationStatus) => void;
}) {
  const { student } = application;
  const age = student.age;

  return (
    <motion.article layout transition={springSoft} className="surface min-w-0 overflow-hidden rounded-3xl">
      <div className="flex items-start gap-4 p-5">
        <Avatar name={student.fullName} src={student.photoUrl} size={56} rounded="square" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-paper">
                {student.fullName}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-paper-dim">
                <span>
                  {age} {plural(age, 'год', 'года', 'лет')}
                </span>
                <span className="text-paper-faint">·</span>
                <span className="flex items-center gap-1">
                  <GraduationCap className="size-3.5 shrink-0" aria-hidden />
                  {student.university}, {student.studyYear} курс
                </span>
                {student.studyVerified && (
                  <Tag tone="accent">
                    <ShieldCheck className="size-3" aria-hidden />
                    Учёба подтверждена
                  </Tag>
                )}
              </p>
              <p className="mt-1 truncate text-[13px] text-paper-faint">{student.speciality}</p>
            </div>

            <ApplicationStatusPill status={application.status} className="shrink-0" />
          </div>

          <p className="mt-3 text-[12.5px] text-paper-faint">
            Откликнулся на «{application.vacancyTitle}» {timeAgo(application.createdAt)}
          </p>

          {student.skills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {student.skills.slice(0, expanded ? undefined : 4).map((skill) => (
                <Tag key={skill}>{skill}</Tag>
              ))}
              {!expanded && student.skills.length > 4 && (
                <Tag tone="accent">+{student.skills.length - 4}</Tag>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? 'Свернуть профиль' : 'Раскрыть профиль'}
          className="shrink-0 rounded-xl p-2 text-paper-faint transition-colors hover:bg-paper/[0.06] hover:text-paper"
        >
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={springSnappy} className="block">
            <ChevronDown className="size-4.5" />
          </motion.span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: durations.base, ease: easeOutExpo }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--hairline)] px-5 py-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-eyebrow uppercase text-paper-faint">Контакты</p>
                  <div className="mt-3 space-y-2">
                    {student.email && (
                      <a
                        href={`mailto:${student.email}`}
                        className="flex items-center gap-2 text-[14px] text-paper transition-colors hover:text-accent-200"
                      >
                        <Mail className="size-3.5 shrink-0 text-paper-faint" aria-hidden />
                        {student.email}
                      </a>
                    )}
                    {student.phone && (
                      <a
                        href={`tel:${student.phone.replace(/[^\d+]/g, '')}`}
                        className="flex items-center gap-2 text-[14px] text-paper transition-colors hover:text-accent-200"
                      >
                        <Phone className="size-3.5 shrink-0 text-paper-faint" aria-hidden />
                        {student.phone}
                      </a>
                    )}
                    {student.resumeUrl ? (
                      <a
                        href={student.resumeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-accent-500/35 bg-accent-500/12 px-3 py-2 text-[13px] text-accent-100 transition-colors hover:bg-accent-500/20"
                      >
                        <Download className="size-3.5" aria-hidden />
                        {student.resumeName ?? 'Резюме'}
                      </a>
                    ) : (
                      <p className="text-[13px] text-paper-faint">Резюме не приложено</p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-eyebrow uppercase text-paper-faint">График</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {student.workDays.map((day) => (
                      <span
                        key={day}
                        className="rounded-md bg-paper/[0.07] px-2 py-1 text-[12px] text-paper/75"
                      >
                        {WEEKDAY_LABEL[day]}
                      </span>
                    ))}
                  </div>
                  {student.hoursPerWeek && (
                    <p className="mt-2 text-[13px] text-paper-dim">
                      до {student.hoursPerWeek} часов в неделю
                    </p>
                  )}
                  {student.city && (
                    <p className="mt-1 text-[13px] text-paper-faint">{student.city}</p>
                  )}
                </div>
              </div>

              {student.about && (
                <div className="mt-5">
                  <p className="flex items-center gap-1.5 text-eyebrow uppercase text-paper-faint">
                    <Sparkles className="size-3" aria-hidden />О себе
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed text-paper-dim">{student.about}</p>
                </div>
              )}

              {/* Портфолио — то, ради чего здесь больше, чем резюме: проекты,
                  достижения, занятия. Пустые блоки компонент не выводит */}
              <div className="mt-5 border-t border-[var(--hairline)] pt-5 empty:hidden">
                <PortfolioView portfolio={student} />
              </div>

              {/* Переход в переписку прямо отсюда: решение «позвать»
                  принимается на карточке кандидата, а не в другом разделе */}
              <div className="mt-6">
                <Link href={`/employer/messages?thread=${application.id}`}>
                  <Button variant="accent" size="md" icon={<MessageSquare />}>
                    Написать кандидату
                  </Button>
                </Link>
              </div>

              <div className="mt-6">
                <p className="text-eyebrow uppercase text-paper-faint">Этап отбора</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {APPLICATION_STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={pending || status === application.status}
                      onClick={() => onStatus(status)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-300',
                        status === application.status
                          ? 'border-accent-400/55 bg-accent-500/20 text-paper'
                          : 'border-[var(--hairline)] bg-graphite-900/45 text-paper/60 hover:border-paper/25 hover:text-paper',
                        pending && 'opacity-50',
                      )}
                    >
                      {APPLICATION_STATUS_LABEL[status]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
