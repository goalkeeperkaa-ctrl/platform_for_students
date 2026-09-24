import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, Globe, MapPin, PlayCircle } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { getCompanyPublic } from '@/lib/services';
import { plural } from '@/lib/utils';
import { EMPLOYMENT_TYPE_LABEL } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const company = await getCompanyPublic(params.id);
  return { title: company ? company.companyName : 'Компания не найдена' };
}

const isHttp = (url: string) => /^https?:\/\//i.test(url);

/**
 * Публичная страница компании.
 *
 * Открыта без входа: студент решает, откликаться ли, в том числе по тому,
 * что это за место, — и до регистрации тоже. Поэтому здесь только то, что
 * компания сама решила показать, и ни одного контакта человека.
 *
 * Компания на модерации отдаёт 404, как несуществующая: по разнице
 * ответов нельзя было бы перебирать, кто зарегистрировался.
 */
export default async function CompanyPage({ params }: Props) {
  const company = await getCompanyPublic(params.id);
  if (!company) notFound();

  const links = [
    ...(company.website && isHttp(company.website)
      ? [{ label: 'Сайт', url: company.website, icon: <Globe className="size-3.5 shrink-0" aria-hidden /> }]
      : []),
    ...company.socials
      .filter((s) => isHttp(s.url))
      .map((s) => ({ label: s.label, url: s.url, icon: <ExternalLink className="size-3.5 shrink-0" aria-hidden /> })),
    ...(company.videoUrl && isHttp(company.videoUrl)
      ? [{ label: 'Видео о компании', url: company.videoUrl, icon: <PlayCircle className="size-3.5 shrink-0" aria-hidden /> }]
      : []),
  ];

  return (
    <div className="min-h-dvh">
      <header className="page-x mx-auto flex h-[var(--header-h)] max-w-3xl items-center">
        <Logo href="/" />
      </header>

      <main className="page-x mx-auto max-w-3xl pb-24 pt-4">
        <section className="glass rounded-3xl p-6 sm:p-8">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar name={company.companyName} src={company.logoUrl} size={72} rounded="square" />
            <div className="min-w-0">
              <p className="text-eyebrow uppercase text-paper-faint">Компания</p>
              <h1 className="mt-1 break-words text-display-sm text-paper">{company.companyName}</h1>
              {company.city && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[13.5px] text-paper-dim">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  {company.city}
                </p>
              )}
            </div>
          </div>

          {company.about && (
            <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-paper-dim">{company.about}</p>
          )}

          {links.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {links.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow ugc"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-[var(--hairline)] bg-graphite-900/45 px-3 py-2 text-[13px] text-paper/80 transition-colors hover:border-paper/25 hover:text-paper"
                >
                  {link.icon}
                  <span className="truncate">{link.label}</span>
                </a>
              ))}
            </div>
          )}
        </section>

        {company.photos.length > 0 && (
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Фото компании">
            {company.photos.map((src) => (
              <div key={src} className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--hairline)]">
                <Image src={src} alt="" fill unoptimized sizes="(min-width: 640px) 33vw, 50vw" className="object-cover" />
              </div>
            ))}
          </section>
        )}

        {company.videoUrl?.startsWith('/api/files/companyVideo/') && (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- видео о компании без субтитров
          <video src={company.videoUrl} controls className="mt-6 w-full max-w-sm rounded-2xl border border-[var(--hairline)]" />
        )}

        <section className="glass mt-6 rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[15px] text-paper">
              {company.activeVacancies > 0 ? (
                <>
                  <span className="font-semibold">{company.activeVacancies}</span>{' '}
                  {plural(company.activeVacancies, 'открытая вакансия', 'открытые вакансии', 'открытых вакансий')}
                </>
              ) : (
                'Открытых вакансий сейчас нет'
              )}
            </p>
            <Link href="/feed">
              <Button variant="accent" size="md">
                Смотреть вакансии
              </Button>
            </Link>
          </div>
          {company.vacancies.length > 0 && (
            <ul className="mt-5 divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
              {company.vacancies.map((vacancy) => (
                <li key={vacancy.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                  <span className="min-w-0 break-words text-[14.5px] text-paper">{vacancy.title}</span>
                  <span className="text-[12.5px] text-paper-faint">
                    {vacancy.city} · {EMPLOYMENT_TYPE_LABEL[vacancy.employmentType]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
