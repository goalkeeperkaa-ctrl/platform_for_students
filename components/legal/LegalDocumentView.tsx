import { LEGAL_REQUISITES_PENDING, versionLabel, type LegalDocument } from '@/lib/legal';

/**
 * Текст юридического документа — один и тот же в окне регистрации и на
 * отдельной странице. Две вёрстки одного текста разошлись бы на первой же
 * правке, и человек соглашался бы не с тем, что опубликовано.
 */
export function LegalDocumentView({
  doc,
  headingLevel = 'h2',
}: {
  doc: LegalDocument;
  headingLevel?: 'h2' | 'h3';
}) {
  const Heading = headingLevel;

  return (
    <div className="text-[14.5px] leading-relaxed text-paper-dim">
      <p className="text-[12.5px] text-paper-faint">Редакция от {versionLabel(doc.version)}</p>

      {LEGAL_REQUISITES_PENDING && (
        <p className="mt-3 rounded-2xl border border-warn/35 bg-warn/[0.08] px-4 py-3 text-[13px] text-warn">
          Реквизиты оператора будут добавлены до запуска платформы.
        </p>
      )}

      <p className="mt-4">{doc.intro}</p>

      {doc.sections.map((section) => (
        <section key={section.title} className="mt-6">
          <Heading className="text-[15px] font-semibold tracking-[-0.01em] text-paper">{section.title}</Heading>
          {section.items && (
            <ul className="mt-2.5 list-disc space-y-1.5 pl-5 marker:text-paper-faint">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="mt-2.5">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
