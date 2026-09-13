import type { Metadata } from 'next';
import Link from 'next/link';
import { SwipeDeck } from '@/components/swipe/SwipeDeck';
import { COMPLETE_PROFILE_PERCENT, profileCompleteness } from '@/lib/portfolio';
import { requireStudentPage } from '@/lib/security/guards';
import { buildFeed } from '@/lib/services';

export const metadata: Metadata = { title: 'Лента вакансий' };
export const dynamic = 'force-dynamic';

export default async function FeedPage() {
  const { student } = await requireStudentPage('/feed');
  const vacancies = await buildFeed(student.id);
  const completeness = profileCompleteness(student);

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 w-full max-w-[26rem]">
        <h1 className="text-display-sm text-paper">Ваша подборка</h1>
        <p className="mt-1.5 text-[13.5px] text-paper-dim">
          Вправо — отклик уходит работодателю. Влево — вакансия уйдёт в «Пропущенные».
        </p>
      </div>

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
