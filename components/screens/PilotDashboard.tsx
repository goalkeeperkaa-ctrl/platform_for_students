import { BarList, type BarItem } from './admin/BarList';
import { COMPLETE_PROFILE_PERCENT } from '@/lib/portfolio';
import { timeAgo } from '@/lib/utils';
import type { PilotMetricsDTO } from '@/lib/types';

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Медиана в днях или часах — так, как её удобно прочитать глазами. */
function duration(value: number | null, unit: 'days' | 'hours'): string {
  if (value === null) return '—';
  const hours = unit === 'days' ? value * 24 : value;
  if (hours < 1) return 'меньше часа';
  if (hours < 48) return `${Math.round(hours)} ч`;
  return `${(hours / 24).toFixed(1).replace('.', ',')} дн.`;
}

/**
 * Метрики пилота с доски Miro.
 *
 * Первая строка — «время до первой возможности» и «время до первого
 * отклика»: это главный вопрос пилота — быстро ли студент получает шанс.
 * Остальное объясняет, где он теряется: не заполнил профиль, не
 * откликнулся, откликнулся, но никто не позвал.
 */
export function PilotDashboard({ metrics }: { metrics: PilotMetricsDTO }) {
  const { students, companies, vacancies, applications, timing } = metrics;

  const path: BarItem[] = [
    { key: 'registered', label: 'Зарегистрировались', value: students.registered, tone: 'default' },
    {
      key: 'profile',
      label: `Заполнили профиль на ${COMPLETE_PROFILE_PERCENT}% и больше`,
      value: students.completedProfile,
      tone: 'default',
    },
    { key: 'applied', label: 'Откликнулись хотя бы раз', value: students.applied, tone: 'default' },
    { key: 'opportunity', label: 'Получили приглашение', value: students.gotOpportunity, tone: 'good' },
  ];

  return (
    <>
      <header className="mb-8">
        <p className="text-eyebrow uppercase text-accent-300">HR-менеджер</p>
        <h1 className="mt-3 text-display-md text-paper">Метрики пилота</h1>
        <p className="mt-2.5 max-w-[64ch] text-[14px] leading-relaxed text-paper-dim">
          Доходят ли студенты и компании до результата. Считается по текущим данным и журналу событий.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-[var(--hairline)] bg-[var(--hairline)] lg:grid-cols-4">
        <Tile
          value={duration(timing.firstOpportunityDays, 'days')}
          label="время до первой возможности"
          note="медиана: от регистрации до приглашения"
        />
        <Tile
          value={duration(timing.firstApplicationHours, 'hours')}
          label="время до первого отклика"
          note="медиана: от регистрации"
        />
        <Tile
          value={`${pct(students.completedProfile, students.registered)}%`}
          label="профилей заполнено"
          note={`${students.completedProfile} из ${students.registered}`}
        />
        <Tile
          value={`${pct(students.gotOpportunity, students.applied)}%`}
          label="откликнувшихся получили приглашение"
          note={`${students.gotOpportunity} из ${students.applied}`}
        />
        <Tile
          value={String(companies.selfRegistered)}
          label="компаний зарегистрировались сами"
          note={`одобрено ${companies.approved} · всего клиентов ${companies.total}`}
        />
        <Tile
          value={String(vacancies.published)}
          label="вакансий в ленте"
          note={`из кабинетов компаний ${vacancies.fromCabinet}`}
        />
        <Tile
          value={String(metrics.profileViews)}
          label="просмотров профилей работодателями"
          note={`просмотрено откликов ${applications.viewed} из ${applications.total}`}
        />
        <Tile
          value={String(applications.hired)}
          label="вышли на работу"
          note={`следующий шаг по откликам: ${applications.nextStep}`}
        />
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Путь студента" subtitle="Сколько человек дошло до каждого шага">
          <BarList items={path} total={students.registered} unit={['студент', 'студента', 'студентов']} />
          <p className="mt-6 text-[12.5px] leading-relaxed text-paper-faint">
            Учёба подтверждена у {students.verified} из {students.registered}. Компаний с вакансией в ленте:{' '}
            {companies.withPublishedVacancy}.
          </p>
        </Panel>

        <Panel title="Журнал событий" subtitle="Последние шаги на платформе">
          {metrics.events.length === 0 ? (
            <p className="text-[13.5px] text-paper-faint">
              Событий пока нет — они появятся с первыми регистрациями и откликами.
            </p>
          ) : (
            <ul className="max-h-[26rem] space-y-1.5 overflow-y-auto pr-1">
              {metrics.events.map((event) => (
                <li
                  key={event.id}
                  className="flex items-baseline justify-between gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-paper/[0.03]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-paper-dim">{event.label}</span>
                    {event.subject && (
                      <span className="block truncate text-[11.5px] text-paper-faint">{event.subject}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-paper-faint">
                    {timeAgo(event.createdAt)}
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

function Tile({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className="h-full min-w-0 bg-ink px-5 py-6 sm:px-6">
      <p className="text-[clamp(1.5rem,2.6vw,2.1rem)] font-semibold leading-none tracking-[-0.04em] text-paper">
        {value}
      </p>
      <p className="mt-2.5 text-[13px] leading-snug text-paper-dim">{label}</p>
      {note && <p className="mt-1 text-[11.5px] leading-snug text-paper-faint">{note}</p>}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="surface min-w-0 rounded-3xl p-5 sm:p-6">
      <header className="mb-5">
        <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-paper">{title}</h2>
        {subtitle && <p className="mt-1 text-[12.5px] text-paper-faint">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}
