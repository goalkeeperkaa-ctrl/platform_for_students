import { PrismaClient } from '@prisma/client';
import { INSTITUTIONS } from '../lib/db/seed-data';

/**
 * Загрузить справочник вузов в базу.
 *
 *   npm run institutions:load
 *
 * Нужен на бою: `db:seed` там запускать нельзя — он заводит демо-учётки с
 * известными паролями. А без справочника регистрация остаётся без
 * подсказок вузов, страница /institutions — пустой, и HR не видит, сколько
 * студентов от какого учреждения.
 *
 * Идемпотентно: вуз сопоставляется по slug, повторный запуск обновляет
 * названия и описания и добавляет новые. Вузы, убранные из списка, в базе
 * остаются: к ним уже могут быть привязаны студенты.
 */
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL не задан. Справочник нужен в базе, а не в памяти процесса.');
    process.exitCode = 1;
    return;
  }

  const db = new PrismaClient();
  try {
    const existing = new Set((await db.institution.findMany({ select: { slug: true } })).map((i) => i.slug));
    let created = 0;
    let updated = 0;

    for (const item of INSTITUTIONS) {
      await db.institution.upsert({ where: { slug: item.slug }, update: item, create: item });
      if (existing.has(item.slug)) updated++;
      else created++;
    }

    console.log(
      `справочник вузов: добавлено ${created}, обновлено ${updated}, всего в списке ${INSTITUTIONS.length}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Загрузка справочника не завершилась:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
