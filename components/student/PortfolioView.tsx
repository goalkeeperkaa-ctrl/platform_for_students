import { ExternalLink, FolderKanban, PlayCircle, Target, Trophy } from 'lucide-react';
import {
  ACTIVITY_KINDS,
  ACTIVITY_KIND_LABEL,
  LOOKING_FOR_LABEL,
  type StudentPortfolio,
} from '@/lib/types';

/**
 * Портфолио студента глазами работодателя.
 *
 * Пустые блоки не выводятся вовсе: заголовок «Достижения» без содержимого
 * читается как «достижений нет», хотя студент их просто не вписал.
 *
 * Ссылки уже проверены на http/https при записи и при чтении из базы.
 * Здесь проверка ещё раз, прямо перед href: этот компонент — последнее
 * место, где `javascript:`-ссылка из анкеты могла бы стать кодом в
 * кабинете работодателя, и полагаться на то, что до него всё отфильтровали,
 * здесь не стоит.
 */
export function PortfolioView({ portfolio }: { portfolio: StudentPortfolio }) {
  const {
    lookingFor,
    goals,
    projects,
    achievements,
    activities,
    hobbies,
    links,
    videoUrl,
  } = portfolio;

  const hasAnything =
    lookingFor.length > 0 ||
    Boolean(goals) ||
    projects.length > 0 ||
    achievements.length > 0 ||
    activities.length > 0 ||
    Boolean(hobbies) ||
    links.length > 0 ||
    Boolean(videoUrl);

  if (!hasAnything) return null;

  return (
    <div className="space-y-5">
      {(lookingFor.length > 0 || goals) && (
        <Block icon={<Target className="size-3" aria-hidden />} title="Что ищет и зачем">
          {lookingFor.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {lookingFor.map((kind) => (
                <span
                  key={kind}
                  className="rounded-full border border-accent-400/35 bg-accent-500/12 px-2.5 py-1 text-[12px] text-accent-100"
                >
                  {LOOKING_FOR_LABEL[kind]}
                </span>
              ))}
            </div>
          )}
          {goals && <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-paper-dim">{goals}</p>}
        </Block>
      )}

      {projects.length > 0 && (
        <Block icon={<FolderKanban className="size-3" aria-hidden />} title="Проекты">
          <ul className="space-y-3">
            {projects.map((project, i) => (
              <li key={`${project.title}-${i}`} className="min-w-0">
                <p className="text-[14px] font-medium text-paper">
                  {project.title}
                  {project.link && <SafeLink href={project.link} className="ml-2 align-middle" />}
                </p>
                {project.description && (
                  <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-paper-dim">
                    {project.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {achievements.length > 0 && (
        <Block icon={<Trophy className="size-3" aria-hidden />} title="Достижения">
          <ul className="space-y-2">
            {achievements.map((item, i) => (
              <li key={`${item.title}-${i}`} className="text-[14px] leading-relaxed text-paper-dim">
                <span className="text-paper">{item.title}</span>
                {item.year && <span className="text-paper-faint"> · {item.year}</span>}
                {item.description && <span className="block text-[13.5px]">{item.description}</span>}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {activities.length > 0 &&
        ACTIVITY_KINDS.map((kind) => {
          const items = activities.filter((a) => a.kind === kind);
          if (items.length === 0) return null;
          return (
            <Block key={kind} title={ACTIVITY_KIND_LABEL[kind]}>
              <ul className="space-y-2">
                {items.map((item, i) => (
                  <li key={`${item.title}-${i}`} className="text-[14px] leading-relaxed text-paper-dim">
                    <span className="text-paper">{item.title}</span>
                    {item.description && <span className="block text-[13.5px]">{item.description}</span>}
                  </li>
                ))}
              </ul>
            </Block>
          );
        })}

      {hobbies && (
        <Block title="Хобби и интересы">
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-paper-dim">{hobbies}</p>
        </Block>
      )}

      {videoUrl && videoUrl.startsWith('/api/files/studentVideo/') && (
        <Block title="Видео-визитка">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- видео-визитка без субтитров */}
          <video src={videoUrl} controls className="w-full max-w-xs rounded-2xl border border-[var(--hairline)]" />
        </Block>
      )}

      {(links.length > 0 || (videoUrl && isHttp(videoUrl))) && (
        <Block title="Ссылки и подтверждения">
          <div className="flex flex-wrap gap-2">
            {videoUrl && isHttp(videoUrl) && (
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className="inline-flex items-center gap-1.5 rounded-xl border border-accent-500/35 bg-accent-500/12 px-3 py-2 text-[13px] text-accent-100 transition-colors hover:bg-accent-500/20"
              >
                <PlayCircle className="size-3.5" aria-hidden />
                Видео-визитка
              </a>
            )}
            {links.map((link, i) =>
              isHttp(link.url) ? (
                <a
                  key={`${link.url}-${i}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow ugc"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-[var(--hairline)] bg-graphite-900/45 px-3 py-2 text-[13px] text-paper/80 transition-colors hover:border-paper/25 hover:text-paper"
                >
                  <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{link.label}</span>
                </a>
              ) : null,
            )}
          </div>
        </Block>
      )}
    </div>
  );
}

function isHttp(url: string) {
  return /^https?:\/\//i.test(url);
}

function SafeLink({ href, className }: { href: string; className?: string }) {
  if (!isHttp(href)) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      aria-label="Открыть ссылку проекта"
      className={`inline-flex text-paper-faint transition-colors hover:text-accent-200 ${className ?? ''}`}
    >
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

function Block({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="flex items-center gap-1.5 text-eyebrow uppercase text-paper-faint">
        {icon}
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </section>
  );
}
