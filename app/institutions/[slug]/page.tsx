import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, MapPin } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Chip';
import { institutionLabel } from '@/lib/institutions';
import { RATING_MIN_PUBLIC, RATING_MIN_RANKED } from '@/lib/rating';
import { getInstitutionPublic, getInstitutionRating } from '@/lib/services';

export const dynamic = 'force-dynamic';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const institution = await getInstitutionPublic(params.slug);
  return { title: institution ? institutionLabel(institution) : 'Учебное заведение не найдено' };
}

/**
 * Страница учебного заведения: название, город, описание, направления.
 *
 * Открыта без входа, как и страница компании. Студентов этого вуза здесь
 * нет списком, а числа — только обезличенные и от пяти студентов с
 * подтверждённой учёбой: по небольшому колледжу число уже почти указывает
 * на конкретных людей.
 */
export default async function InstitutionPage({ params }: Props) {
  const institution = await getInstitutionPublic(params.slug);
  if (!institution) notFound();

  const rating = await getInstitutionRating(institution.slug);
  const label = institutionLabel(institution);
  const website = institution.website && /^https?:\/\//i.test(institution.website) ? institution.website : null;

  return (
    <div className="min-h-dvh">
      <header className="page-x mx-auto flex h-[var(--header-h)] max-w-3xl items-center justify-between gap-4">
        <Logo href="/" />
        <Link href="/institutions" className="text-[13px] text-paper-faint transition-colors hover:text-paper">
          Все вузы
        </Link>
      </header>

      <main className="page-x mx-auto max-w-3xl pb-24 pt-4">
        <section className="glass rounded-3xl p-6 sm:p-8">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar name={label} src={null} size={72} rounded="square" />
            <div className="min-w-0">
              <p className="text-eyebrow uppercase text-paper-faint">Учебное заведение</p>
              <h1 className="mt-1 break-words text-display-sm text-paper">{label}</h1>
              {institution.shortName && (
                <p className="mt-1 break-words text-[14px] text-paper-dim">{institution.name}</p>
              )}
              <p className="mt-1.5 flex items-center gap-1.5 text-[13.5px] text-paper-dim">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                {institution.city}
              </p>
            </div>
          </div>

          {institution.description && (
            <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-paper-dim">
              {institution.description}
            </p>
          )}

          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-6 inline-flex max-w-full items-center gap-1.5 rounded-xl border border-[var(--hairline)] bg-graphite-900/45 px-3 py-2 text-[13px] text-paper/80 transition-colors hover:border-paper/25 hover:text-paper"
            >
              <ExternalLink className="size-3.5 shrink-0" aria-hidden />
              Сайт вуза
            </a>
          )}
        </section>

        <section className="glass mt-6 rounded-3xl p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-eyebrow uppercase text-paper-faint">Студенты на платформе</h2>
            <Link
              href="/institutions/rating"
              className="text-[13px] text-paper/75 underline-offset-4 transition-colors hover:text-paper hover:underline"
            >
              Рейтинг вузов
            </Link>
          </div>
          {rating && rating.students !== null ? (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="с подтверждённой учёбой" value={rating.students} />
                <Stat label="откликов" value={rating.applications ?? 0} />
                <Stat label="приглашены" value={rating.invited ?? 0} />
                <Stat label="работают" value={rating.hired ?? 0} note={`${rating.share}% студентов`} />
              </dl>
              <p className="mt-4 text-[13px] text-paper-faint">
                {rating.place
                  ? `${rating.place}-е место в рейтинге вузов`
                  : `Место в рейтинге — от ${RATING_MIN_RANKED} студентов с подтверждённой учёбой`}
              </p>
            </>
          ) : (
            <p className="mt-3 text-[14px] leading-relaxed text-paper-dim">
              Статистика появится, когда на платформе будет не меньше {RATING_MIN_PUBLIC} студентов этого
              вуза с подтверждённой учёбой.
            </p>
          )}
        </section>

        {institution.directions.length > 0 && (
          <section className="glass mt-6 rounded-3xl p-6 sm:p-8">
            <h2 className="text-eyebrow uppercase text-paper-faint">Направления</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {institution.directions.map((direction) => (
                <Tag key={direction}>{direction}</Tag>
              ))}
            </div>
          </section>
        )}

        <section className="glass mt-6 flex flex-col items-start gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <p className="text-[15px] leading-relaxed text-paper">
            Учитесь здесь? Выберите вуз при регистрации — работодатели увидят, где вы учитесь.
          </p>
          <Link href="/register" className="shrink-0">
            <Button variant="accent" size="md">
              Зарегистрироваться
            </Button>
          </Link>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--hairline)] bg-graphite-900/45 p-4">
      <dd className="text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-paper">{value}</dd>
      <dt className="mt-2 text-[12.5px] leading-snug text-paper-faint">{label}</dt>
      {note && <p className="mt-1 text-[12px] text-accent-200">{note}</p>}
    </div>
  );
}
