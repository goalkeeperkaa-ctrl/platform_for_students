import Link from 'next/link';
import { Clock3, ShieldCheck, TriangleAlert } from 'lucide-react';

/**
 * Подтверждение учёбы под полем «Вуз» в профиле.
 *
 * Предупреждение о сбросе показывается до сохранения, а не после: узнать,
 * что отметка пропала, уже сменив вуз, — значит решить, что платформа
 * сломалась.
 */
export function StudyVerificationNote({
  verified,
  changed,
  institutionSlug,
}: {
  verified: boolean;
  changed: boolean;
  institutionSlug: string | null;
}) {
  return (
    <div className="-mt-2 space-y-1.5 pl-1 text-[12.5px] leading-snug">
      {verified && !changed && (
        <p className="flex items-center gap-1.5 text-yes-glow">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
          Учёба подтверждена агентством — работодатели видят отметку
        </p>
      )}
      {verified && changed && (
        <p className="flex items-center gap-1.5 text-warn">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          После сохранения отметка снимется: агентство проверит новый вуз
        </p>
      )}
      {!verified && (
        <p className="flex items-center gap-1.5 text-paper-faint">
          <Clock3 className="size-3.5 shrink-0" aria-hidden />
          Учёбу подтверждает HR-менеджер агентства — по справке об обучении или студенческому билету
        </p>
      )}
      {institutionSlug && (
        <Link
          href={`/institutions/${institutionSlug}`}
          className="inline-flex text-paper/75 underline-offset-4 transition-colors hover:text-paper hover:underline"
        >
          Страница вуза
        </Link>
      )}
    </div>
  );
}
