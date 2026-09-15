import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/brand/Logo';
import { LegalDocumentView } from '@/components/legal/LegalDocumentView';
import { LEGAL_DOCUMENTS, type LegalDocument } from '@/lib/legal';

type Props = { params: { slug: string } };

function findDocument(slug: string): LegalDocument | null {
  // hasOwnProperty, а не LEGAL_DOCUMENTS[slug]: иначе /legal/constructor
  // нашёл бы свойство прототипа вместо «не найдено»
  return Object.prototype.hasOwnProperty.call(LEGAL_DOCUMENTS, slug)
    ? LEGAL_DOCUMENTS[slug as LegalDocument['slug']]
    : null;
}

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCUMENTS).map((slug) => ({ slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  return { title: findDocument(params.slug)?.title ?? 'Документ не найден' };
}

const NAV: Array<{ slug: LegalDocument['slug']; label: string }> = [
  { slug: 'terms', label: 'Соглашение' },
  { slug: 'privacy', label: 'Политика' },
  { slug: 'consent', label: 'Согласие студента' },
  { slug: 'company-consent', label: 'Согласие компании' },
];

/**
 * Юридический документ отдельной страницей — тот же текст, что в окне при
 * регистрации. Постоянный адрес нужен, чтобы на документ можно было
 * сослаться: в письме, в ответе на запрос, из подвала сайта.
 */
export default function LegalPage({ params }: Props) {
  const doc = findDocument(params.slug);
  if (!doc) notFound();

  return (
    <div className="min-h-dvh">
      <header className="page-x mx-auto flex h-[var(--header-h)] max-w-3xl items-center justify-between gap-4">
        <Logo href="/" />
      </header>

      <main className="page-x mx-auto max-w-3xl pb-24 pt-4">
        <nav aria-label="Документы" className="-mx-1 mb-6 flex flex-wrap gap-2">
          {NAV.map((item) => (
            <Link
              key={item.slug}
              href={`/legal/${item.slug}`}
              aria-current={item.slug === doc.slug ? 'page' : undefined}
              className={
                item.slug === doc.slug
                  ? 'rounded-full border border-accent-400/50 bg-accent-500/15 px-3 py-1.5 text-[12.5px] text-paper'
                  : 'rounded-full border border-[var(--hairline)] px-3 py-1.5 text-[12.5px] text-paper-faint transition-colors hover:text-paper'
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <h1 className="break-words text-display-sm text-paper">{doc.title}</h1>
        <div className="glass mt-6 rounded-3xl p-5 sm:p-8">
          <LegalDocumentView doc={doc} />
        </div>
      </main>
    </div>
  );
}
