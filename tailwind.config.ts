import type { Config } from 'tailwindcss';

/**
 * Дизайн-система Fattakhov HR Agency.
 *
 * Бренд монохромный: графит знака #2F3337, бумага #F8F8F8, чистый чёрный
 * как основа полотна. Единственный цвет — серо-голубой #546E88; он же
 * задаёт температуру всех нейтралей, поэтому шкала graphite не серая,
 * а чуть холодная. Чистый серый рядом с фирменным графитом выглядит
 * грязным.
 *
 * Зелёный существует ровно в одном месте — подсветка свайпа вправо.
 * Это не часть палитры бренда, а сигнал «действие засчитано».
 *
 * Светлая и тёмная тема — тот же набор ролей (ink = полотно, paper =
 * текст, graphite/accent = ступени поверхностей), но каждая роль читает
 * значение из CSS-переменной (см. app/globals.css, :root и .dark), а не
 * литеральный цвет. Поэтому переключение темы не требует ни одного
 * dark:-класса в компонентах — только смену набора переменных. Тройка
 * чисел без rgb() — это то, что требует запись `rgb(var(--x) / <alpha>)`,
 * благодаря ей у каждого оттенка по-прежнему работают модификаторы
 * прозрачности вроде bg-graphite-900/50.
 */
function withOpacity(variable: string) {
  return ({ opacityValue }: { opacityValue?: string }) =>
    opacityValue === undefined
      ? `rgb(var(${variable}))`
      : `rgb(var(${variable}) / ${opacityValue})`;
}

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // Тайповые определения Tailwind 3 не знают о функциях-значениях цвета
      // (opacityValue-хелпер) — паттерн полностью официальный и рабочий
      // в рантайме (см. документацию Tailwind по CSS-переменным для тёмной
      // темы), просто не описан в RecursiveKeyValuePair. Приведение типа —
      // единственная альтернатива отказу от модификаторов прозрачности
      // вроде bg-graphite-900/50, которые используются по всему проекту.
      colors: {
        paper: {
          DEFAULT: withOpacity('--color-paper'),
          dim: 'var(--color-paper-dim)',
          faint: 'var(--color-paper-faint)',
        },
        ink: {
          DEFAULT: withOpacity('--color-ink'),
          raise: 'var(--color-ink-raise)',
          deep: 'var(--color-ink-deep)',
        },
        graphite: {
          950: withOpacity('--color-graphite-950'),
          900: withOpacity('--color-graphite-900'),
          850: withOpacity('--color-graphite-850'),
          800: withOpacity('--color-graphite-800'),
          750: withOpacity('--color-graphite-750'),
          700: withOpacity('--color-graphite-700'),
          600: withOpacity('--color-graphite-600'),
          500: withOpacity('--color-graphite-500'),
          400: withOpacity('--color-graphite-400'),
          300: withOpacity('--color-graphite-300'),
          200: withOpacity('--color-graphite-200'),
          100: withOpacity('--color-graphite-100'),
        },
        accent: {
          950: withOpacity('--color-accent-950'),
          900: withOpacity('--color-accent-900'),
          800: withOpacity('--color-accent-800'),
          700: withOpacity('--color-accent-700'),
          600: withOpacity('--color-accent-600'),
          500: withOpacity('--color-accent-500'),
          400: withOpacity('--color-accent-400'),
          300: withOpacity('--color-accent-300'),
          200: withOpacity('--color-accent-200'),
          100: withOpacity('--color-accent-100'),
        },
        yes: {
          DEFAULT: '#4FA37F',
          glow: '#71D9AC',
          deep: '#1C3A2F',
        },
        no: {
          DEFAULT: '#5A5F64',
          deep: '#17191B',
        },
        warn: '#C9A227',
        danger: '#B4534F',
      } as any,
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Дисплейная шкала на clamp: заголовки должны дышать на десктопе
        // и не ломать перенос на 360px.
        'display-xl': ['clamp(2.75rem, 7.2vw, 6rem)', { lineHeight: '0.94', letterSpacing: '-0.045em', fontWeight: '600' }],
        'display-lg': ['clamp(2.25rem, 5.4vw, 4rem)', { lineHeight: '0.98', letterSpacing: '-0.04em', fontWeight: '600' }],
        'display-md': ['clamp(1.75rem, 3.6vw, 2.75rem)', { lineHeight: '1.04', letterSpacing: '-0.032em', fontWeight: '600' }],
        'display-sm': ['clamp(1.375rem, 2.4vw, 1.875rem)', { lineHeight: '1.12', letterSpacing: '-0.024em', fontWeight: '600' }],
        eyebrow: ['0.6875rem', { lineHeight: '1', letterSpacing: '0.18em', fontWeight: '500' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
        '4xl': '2.25rem',
      },
      boxShadow: {
        // Значения — переменные темы (app/globals.css, :root/.dark): те же
        // роли, разные оттенки в светлой и тёмной теме.
        hairline: 'inset 0 1px 0 0 var(--glass-highlight)',
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
        'glow-accent': '0 0 0 1px rgb(var(--color-accent-400) / 0.35), 0 8px 32px -8px rgb(var(--color-accent-500) / 0.55)',
        'glow-yes': '0 0 0 1px rgba(113,217,172,0.45), 0 12px 48px -10px rgba(79,163,127,0.5)',
        inset: 'var(--shadow-inset)',
      },
      backdropBlur: {
        glass: '24px',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-quint': 'cubic-bezier(0.83, 0, 0.17, 1)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'aurora-drift': {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(2%, -3%, 0) scale(1.08)' },
        },
        'caret-blink': {
          '0%,70%,100%': { opacity: '1' },
          '20%,50%': { opacity: '0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.8s infinite',
        'aurora-drift': 'aurora-drift 18s ease-in-out infinite',
        'caret-blink': 'caret-blink 1.2s ease-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
