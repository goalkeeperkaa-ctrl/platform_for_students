'use client';

import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'fhr-splash-shown';
/** Длительность ролика (5.8 c) с запасом — на случай если onEnded не придёт. */
const FALLBACK_MS = 7000;
const FADE_MS = 350;

/**
 * Заставка при первом входе: сборка логотипа, затем платформа.
 *
 * Один раз за вкладку (sessionStorage), не при каждом переходе между
 * страницами — иначе ролик показывался бы и при обычной навигации.
 * Работает поверх уже отрендеренного приложения (fixed-оверлей), а не
 * блокирует его: контент под заставкой готовится параллельно, и снятие
 * оверлея ничего не задерживает.
 */
export function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dismissedRef = useRef(false);

  useEffect(() => {
    let shown = true;
    try {
      shown = sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      /* приватный режим — просто не повторяем показ в течение вкладки на глаз */
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (shown || reduceMotion) return;

    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* недоступно — переживём повторный показ при следующей вкладке */
    }
    setVisible(true);

    const fallback = setTimeout(dismiss, FALLBACK_MS);
    return () => clearTimeout(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismiss стабилен по построению, лишний перезапуск эффекта не нужен
  }, []);

  // Атрибут autoplay не везде надёжен сам по себе (например, если видео
  // смонтировалось до того, как вкладка стала видимой) — явный play()
  // подстраховывает; тихий видео и так разрешён политикой автовоспроизведения,
  // поэтому здесь нет смысла ждать жест пользователя.
  useEffect(() => {
    if (!visible) return;
    videoRef.current?.play().catch(() => {
      /* автовоспроизведение всё же отклонено — досмотрит по клику или дождётся отвала по таймауту */
    });
  }, [visible]);

  function dismiss() {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setFading(true);
    setTimeout(() => setVisible(false), FADE_MS);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black transition-opacity ease-out"
      style={{ transitionDuration: `${FADE_MS}ms`, opacity: fading ? 0 : 1 }}
      aria-hidden
    >
      <video
        ref={videoRef}
        src="/splash/intro.mp4"
        autoPlay
        muted
        playsInline
        onEnded={dismiss}
        onError={dismiss}
        className="h-full w-full object-contain"
      />
    </div>
  );
}
