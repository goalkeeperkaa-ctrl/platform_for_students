import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Проверка здоровья для контейнера и прокси.
 *
 * Отвечает «живо», только если отвечает база. Процесс, который слушает
 * порт, но не достаёт до PostgreSQL, отдаёт страницу входа и падает на
 * каждом действии — считать его здоровым значит пускать на него людей.
 *
 * Причину отказа наружу не отдаёт: адрес открыт без входа, и текст
 * ошибки базы — это подсказка тому, кто ищет, куда стучаться.
 */
export async function GET() {
  // Без строки подключения — демо-режим разработки. В production сюда
  // не дойти: проверка при старте не даёт процессу подняться.
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ status: 'ok' }, { headers: NO_STORE });
  }

  try {
    const { prisma } = await import('@/lib/db/prisma-client');
    // Ограничение по времени обязательно: зависшее соединение иначе
    // держало бы проверку дольше таймаута оркестратора, и контейнер
    // перезапускался бы по таймауту, а не по реальной причине
    await Promise.race([
      prisma.$queryRaw`select 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    return NextResponse.json({ status: 'ok' }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503, headers: NO_STORE });
  }
}
