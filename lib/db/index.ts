import 'server-only';
import type { DataStore } from './types';

/**
 * Выбор хранилища.
 *
 * Есть DATABASE_URL — работаем на PostgreSQL. Нет — поднимаем
 * демонстрационное хранилище в памяти, чтобы продукт можно было запустить
 * и посмотреть без инфраструктуры. В production такой подмены не
 * происходит: молча потерять данные при рестарте хуже, чем упасть на
 * старте с внятной ошибкой.
 */

const globalForStore = globalThis as unknown as { fhrStore?: Promise<DataStore> };

export function getStore(): Promise<DataStore> {
  if (!globalForStore.fhrStore) {
    // Неудачную попытку из кеша убираем. База может быть недоступна
    // секунду — поднимается медленнее приложения, перезапускается,
    // теряет сеть. Сохранённый отклонённый промис пережил бы её
    // возвращение: все последующие запросы получали бы ту же самую
    // старую ошибку, и лечилось бы это только рестартом процесса.
    globalForStore.fhrStore = build().catch((error: unknown) => {
      globalForStore.fhrStore = undefined;
      throw error;
    });
  }
  return globalForStore.fhrStore;
}

async function build(): Promise<DataStore> {
  if (process.env.DATABASE_URL) {
    const { createPrismaStore } = await import('./prisma-store');
    return createPrismaStore();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL не задан. Демо-режим в памяти в production не запускается — ' +
        'данные не переживут рестарт. Укажите строку подключения к PostgreSQL.',
    );
  }

  console.warn(
    '\n[store] DATABASE_URL не задан — включён демо-режим в памяти процесса.\n' +
      '        Данные живут до перезапуска сервера. Для полноценной работы:\n' +
      '        1) поднимите PostgreSQL (docker compose up -d)\n' +
      '        2) укажите DATABASE_URL в .env\n' +
      '        3) npm run db:push && npm run db:seed\n',
  );

  const { createMemoryStore } = await import('./memory');
  return createMemoryStore();
}

export function isDemoMode(): boolean {
  return !process.env.DATABASE_URL;
}

export type { DataStore } from './types';
export { AccountExistsError, InnExistsError, isAccountExistsError, isInnExistsError } from './memory';
