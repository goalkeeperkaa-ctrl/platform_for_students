import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, MapPin } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Chip';
import { institutionLabel } from '@/lib/institutions';
import { getInstitutionPublic } from '@/lib/services';

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
 * нет ни списком, ни числом: по небольшому колледжу число уже почти
 * указывает на конкретных людей.
 */
export default async function InstitutionPage({ params }: Props) {
  const institution = await getInstitutionPublic(params.slug);
  if (!institution) notFound();

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
