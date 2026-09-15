import type { Metadata } from 'next';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { PILOT_CITY } from '@/lib/pilot';
import { RATING_MIN_PUBLIC, RATING_MIN_RANKED, type RatingRow } from '@/lib/rating';
import { buildInstitutionRating } from '@/lib/services';

export const metadata: Metadata = {
  title: 'Рейтинг учебных заведений',
  description: 'Где студенты находят работу через платформу: доля трудоустроенных по вузам Казани.',
};
export const dynamic = 'force-dynamic';

/**
 * Публичный рейтинг учебных заведений.
 *
 * Открыт без входа: на него ведёт кнопка с сайта агентства, его смотрят вузы
 * и абитуриенты. Поэтому здесь только обезличенные числа и прямо сказано,
 * как они считаются, — рейтинг без методики читается как реклама.
 */
export default async function InstitutionRatingPage() {
  const rows = await buildInstitutionRating();
  const withNumbers = rows.filter((row) => row.students !== null);
  const few = rows.filter((row) => row.students === null);
  const ranked = rows.some((row) => row.place !== null);

  return (
    <div className="min-h-dvh">
      <header className="page-x mx-auto flex h-[var(--header-h)] max-w-5xl items-center justify-between gap-4">
        <Logo href="/" />
        <div className="flex items-center gap-4">
          <Link href="/institutions" className="text-[13px] text-paper-faint transition-colors hover:text-paper">
            Все вузы
          </Link>
          <Link href="/register">
            <Button variant="accent" size="sm">
              Регистрация
            </Button>
          </Link>
        </div>
      </header>

      <main className="page-x mx-auto max-w-5xl pb-24 pt-4">
        <p className="text-eyebrow uppercase text-accent-300">{PILOT_CITY} · пилот платформы</p>
        <h1 className="mt-3 text-display-md text-paper">Рейтинг учебных заведений</h1>
        <p className="mt-2.5 max-w-[64ch] text-[14.5px] leading-relaxed text-paper-dim">
          Где студенты находят работу через платформу: сколько студентов каждого вуза откликаются на
          вакансии, получают приглашения и выходят на работу.
        </p>

        <section className="glass mt-6 rounded-3xl p-5 text-[13.5px] leading-relaxed sm:p-6">
          <h2 className="flex items-center gap-2 font-medium text-paper">
            <Info className="size-4 shrink-0 text-accent-300" aria-hidden />
            Как считаем
          </h2>
          <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-paper-dim marker:text-paper-faint">
            <li>Только студенты, чью учёбу подтвердил HR-менеджер агентства по справке или студенческому билету.</li>
            <li>Место — по доле студентов, вышедших на работу. При равной доле выше тот, где работающих больше.</li>
            <li>
              Цифры показываем, когда у вуза не меньше {RATING_MIN_PUBLIC} студентов, место — от{' '}
              {RATING_MIN_RANKED}: по маленьким числам можно узнать конкретных людей, а одна история ещё не
              рейтинг.
            </li>
            <li>«Приглашены» — студенты, которых позвали на собеседование или сразу на работу.</li>
            <li>Рейтинг показывает трудоустройство через платформу, а не качество обучения в целом.</li>
          </ul>
        </section>

        {!ranked && (
          <p className="mt-8 rounded-2xl border border-[var(--hairline)] bg-graphite-900/45 px-5 py-4 text-[14px] leading-relaxed text-paper-dim">
            Мест пока нет: рейтинг появится, когда у вузов наберётся хотя бы по {RATING_MIN_RANKED} студентов с
            подтверждённой учёбой.
          </p>
        )}

        {withNumbers.length > 0 && <RatingTable rows={withNumbers} />}

        {few.length > 0 && (
          <section className="mt-10">
            <h2 className="text-eyebrow uppercase text-paper-faint">Пока мало данных</h2>
            <p className="mt-2 text-[13px] text-paper-faint">
              Меньше {RATING_MIN_PUBLIC} студентов с подтверждённой учёбой — цифры не публикуются.
            </p>
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {few.map((row) => (
                <li key={row.slug} className="min-w-0">
                  <Link
                    href={`/institutions/${row.slug}`}
                    className="glass block min-w-0 rounded-2xl p-3.5 transition-colors hover:border-paper/25"
                  >
                    <span className="block truncate text-[14.5px] font-medium text-paper">{row.label}</span>
                    <span className="block truncate text-[12.5px] text-paper-faint">{row.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function RatingTable({ rows }: { rows: RatingRow[] }) {
  return (
    <>
      <div className="glass mt-8 hidden overflow-x-auto rounded-3xl sm:block">
        <table className="w-full min-w-[44rem] text-left text-[14px]">
          <thead className="text-[11.5px] uppercase tracking-[0.1em] text-paper-faint">
            <tr className="border-b border-[var(--hairline)]">
              <th className="px-5 py-3.5 font-medium">Место</th>
              <th className="py-3.5 pr-4 font-medium">Учебное заведение</th>
              <th className="px-3 py-3.5 text-right font-medium">Студентов</th>
              <th className="px-3 py-3.5 text-right font-medium">Откликов</th>
              <th className="px-3 py-3.5 text-right font-medium">Приглашены</th>
              <th className="px-3 py-3.5 text-right font-medium">Работают</th>
              <th className="px-5 py-3.5 text-right font-medium">Доля работающих</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.slug} className="border-b border-[var(--hairline)] last:border-0">
                <td className="px-5 py-3.5 tabular-nums text-paper">{row.place ?? '—'}</td>
                <td className="py-3.5 pr-4">
                  <Link href={`/institutions/${row.slug}`} className="font-medium text-paper underline-offset-4 hover:underline">
                    {row.label}
                  </Link>
                  <span className="block text-[12px] text-paper-faint">{row.name}</span>
                </td>
                <td className="px-3 py-3.5 text-right tabular-nums text-paper-dim">{row.students}</td>
                <td className="px-3 py-3.5 text-right tabular-nums text-paper-dim">{row.applications}</td>
                <td className="px-3 py-3.5 text-right tabular-nums text-paper-dim">{row.invited}</td>
                <td className="px-3 py-3.5 text-right tabular-nums text-paper-dim">{row.hired}</td>
                <td className="px-5 py-3.5 text-right tabular-nums text-accent-200">{row.share}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.some((row) => row.place === null) && (
          <p className="border-t border-[var(--hairline)] px-5 py-3 text-[12.5px] text-paper-faint">
            «—» вместо места — у вуза меньше {RATING_MIN_RANKED} студентов с подтверждённой учёбой.
          </p>
        )}
      </div>

      <ul className="mt-8 space-y-3 sm:hidden">
        {rows.map((row) => (
          <li key={row.slug} className="glass rounded-3xl p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-paper/[0.06] text-[15px] font-semibold tabular-nums text-paper">
                {row.place ?? '—'}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/institutions/${row.slug}`} className="block truncate font-medium text-paper">
                  {row.label}
                </Link>
                <span className="block truncate text-[12px] text-paper-faint">{row.name}</span>
              </div>
              <span className="shrink-0 text-[17px] font-semibold tabular-nums text-accent-200">{row.share}%</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
              <MobileStat label="Студентов" value={row.students} />
              <MobileStat label="Откликов" value={row.applications} />
              <MobileStat label="Приглашены" value={row.invited} />
              <MobileStat label="Работают" value={row.hired} />
            </dl>
          </li>
        ))}
        {rows.some((row) => row.place === null) && (
          <li className="px-1 text-[12.5px] text-paper-faint">
            «—» вместо места — у вуза меньше {RATING_MIN_RANKED} студентов с подтверждённой учёбой.
          </li>
        )}
      </ul>
    </>
  );
}

function MobileStat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-paper-faint">{label}</dt>
      <dd className="tabular-nums text-paper">{value ?? '—'}</dd>
    </div>
  );
}
