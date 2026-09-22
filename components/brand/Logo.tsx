import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Фирменный знак: куб из букв F/H/R плюс наборный текст.
 *
 * Используется файл из брендбука, а не воспроизведение в SVG: знак —
 * это идентичность, и «почти такой же» здесь хуже, чем растр.
 *
 * Два растра naложены друг на друга, видимость переключает чистый CSS
 * (dark:), а не JS: класс .dark уже стоит на <html> к первому кадру
 * (анти-мерцающий скрипт в app/layout.tsx), поэтому знак верного цвета
 * виден сразу, без вспышки не того варианта на сервере/при гидратации.
 * light.png — светлый (для тёмного фона), dark.png — тёмный (для
 * светлого фона): имена файлов про цвет знака, не про тему.
 */
export function Logo({
  className,
  href = '/',
  compact = false,
}: {
  className?: string;
  href?: string | null;
  compact?: boolean;
}) {
  const content = compact ? (
    <>
      <Image
        src="/brand/mark-light.png"
        alt="Fattakhov HR Agency"
        width={222}
        height={256}
        priority
        className="hidden h-8 w-auto dark:block"
      />
      <Image
        src="/brand/mark-dark.png"
        alt="Fattakhov HR Agency"
        width={222}
        height={256}
        priority
        className="block h-8 w-auto dark:hidden"
      />
    </>
  ) : (
    <>
      <Image
        src="/brand/logo-light.png"
        alt="Fattakhov HR Agency"
        width={326}
        height={128}
        priority
        className="hidden h-8 w-auto dark:block sm:h-9"
      />
      <Image
        src="/brand/logo-dark.png"
        alt="Fattakhov HR Agency"
        width={326}
        height={128}
        priority
        className="block h-8 w-auto dark:hidden sm:h-9"
      />
    </>
  );

  const classes = cn(
    'inline-flex items-center transition-opacity duration-300 hover:opacity-75',
    className,
  );

  if (!href) return <span className={classes}>{content}</span>;

  return (
    <Link href={href} className={classes} aria-label="Fattakhov HR Agency — на главную">
      {content}
    </Link>
  );
}
