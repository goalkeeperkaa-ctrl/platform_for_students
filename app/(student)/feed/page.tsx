import type { Metadata } from 'next';
import Link from 'next/link';
import { SwipeDeck } from '@/components/swipe/SwipeDeck';
import { COMPLETE_PROFILE_PERCENT, profileCompleteness } from '@/lib/portfolio';
import { requireStudentPage } from '@/lib/security/guards';
import { buildFeed, buildStudyState } from '@/lib/services';
import { PENDING_APPLICATION_DAYS, STUDY_DOC_WORKDAYS } from '@/lib/study';
import type { StudyStateDTO } from '@/lib/types';
import { cn, plural } from '@/lib/utils';

export const metadata: Metadata = { title: 'Лента вакансий' };
export const dynamic = 'force-dynamic';

export default async function FeedPage() {
  const { student } = await requireStudentPage('/feed');
  const vacancies = await buildFeed(student.id);
  const completeness = profileCompleteness(student);
  const study = buildStudyState(student);

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 w-full max-w-[26rem]">
        <h1 className="text-display-sm text-paper">Ваша подборка</h1>
        <p className="mt-1.5 text-[13.5px] text-paper-dim">
          {study.status === 'VERIFIED'
            ? 'Вправо — отклик уходит работодателю. Влево — вакансия уйдёт в «Пропущенные».'
            : 'Вправо — отклик сохранится и уйдёт работодателю после подтверждения учёбы. Влево — в «Пропущенные».'}
        </p>
      </div>

      {/* Подтверждение учёбы — выше подсказки о профиле: от него зависит,
          дойдут ли отклики до работодателя вообще */}
      {study.status !== 'VERIFIED' && <StudyBanner study={study} />}

      {/* Подсказка про портфолио — пока профиль заполнен меньше порога
          пилота. Не модальное окно и не блокировка ленты: студент пришёл
          смотреть вакансии, и мешать ему ради анкеты значит потерять его */}
      {completeness.percent < COMPLETE_PROFILE_PERCENT && (
        <Link
          href="/profile"
          className="mt-3 block w-full max-w-[26rem] rounded-2xl border border-accent-500/30 bg-accent-500/[0.08] px-4 py-3 text-[13px] leading-snug text-paper-dim transition-colors hover:bg-accent-500/[0.14]"
        >
          <span className="font-medium text-paper">Профиль заполнен на {completeness.percent}%.</span>{' '}
          Добавьте проекты и достижения — работодатель увидит больше, чем резюме.
        </Link>
      )}

      {/* Колода получает первую подборку с сервера: пустой экран со
          скелетоном на старте здесь был бы честным, но лишним — данные
          уже есть к моменту рендера. */}
      <SwipeDeck initial={vacancies} />
    </div>
  );
}

/** Что с подтверждением учёбы и что сделать — ссылкой в профиль к справке. */
function StudyBanner({ study }: { study: StudyStateDTO }) {
  const warn = study.status === 'NONE' || study.status === 'REJECTED';
  const deadline =
    study.workdaysLeft > 0
      ? `осталось ${study.workdaysLeft} ${plural(study.workdaysLeft, 'рабочий день', 'рабочих дня', 'рабочих дней')}`
      : study.deadlinePassed
        ? `срок в ${STUDY_DOC_WORKDAYS} рабочих дня прошёл`
        : 'сегодня последний день';

  return (
    <Link
      href="/profile#study"
      data-tour="study"
      className={cn(
        'mt-3 block w-full max-w-[26rem] rounded-2xl border px-4 py-3 text-[13px] leading-snug transition-colors',
        warn
          ? 'border-warn/35 bg-warn/[0.08] text-paper-dim hover:bg-warn/[0.13]'
          : 'border-accent-500/30 bg-accent-500/[0.08] text-paper-dim hover:bg-accent-500/[0.14]',
      )}
    >
      {study.status === 'NONE' && (
        <>
          <span className="font-medium text-warn">Учёба не подтверждена — отклики пока ждут.</span> Загрузите
          справку об обучении в профиле: {deadline}. Отклик, который ждёт дольше {PENDING_APPLICATION_DAYS}{' '}
          дней, удаляется.
        </>
      )}
      {study.status === 'PENDING' && (
        <>
          <span className="font-medium text-paper">Справка на проверке у HR-менеджера.</span> Отклики уйдут
          работодателям, как только учёбу подтвердят.
        </>
      )}
      {study.status === 'REJECTED' && (
        <>
          <span className="font-medium text-warn">HR-менеджер не принял справку.</span>{' '}
          {study.note ? `${study.note} ` : ''}Загрузите новую в профиле.
        </>
      )}
    </Link>
  );
}
