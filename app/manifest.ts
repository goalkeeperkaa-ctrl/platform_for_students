import type { MetadataRoute } from 'next';

/**
 * Манифест для «Добавить на экран» — вместо буквы по умолчанию иконка
 * агентства. purpose "monochrome" — то, что Android перекрашивает под
 * тему и обои телефона сам; двух готовых картинок для этого не нужно,
 * достаточно одного силуэта с альфа-каналом.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fattakhov HR Agency — работа для студентов',
    short_name: 'Fattakhov HR',
    description: 'Подработка и стажировки для студентов с графиком под учёбу.',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-monochrome.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
    ],
  };
}
