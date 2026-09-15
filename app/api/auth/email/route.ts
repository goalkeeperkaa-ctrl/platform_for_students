import { NextResponse } from 'next/server';
import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { sendEmailCode } from '@/lib/account-email';
import { assertSameOrigin, audit, requireRole } from '@/lib/security/guards';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

/**
 * Отправить код подтверждения почты ещё раз.
 *
 * Первый код уходит сам при регистрации. Пауза между письмами — минута,
 * и о ней ответ говорит числом: кнопка на экране показывает обратный отсчёт.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireRole('STUDENT', 'EMPLOYER');

    const limit = await rateLimit('emailCode', session.accountId);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const result = await sendEmailCode(session.accountId);
    if (result.status === 'ALREADY_VERIFIED') return ok({ verified: true });
    if (result.status === 'NO_ACCOUNT') return fail(404, 'Учётная запись не найдена', 'NOT_FOUND');
    if (result.status === 'WAIT') {
      return NextResponse.json(
        {
          error: `Код уже отправлен. Новый можно запросить через ${result.retryAfter} с.`,
          code: 'CODE_WAIT',
          retryAfter: result.retryAfter,
        },
        { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
      );
    }

    await audit(session, { action: 'account.email.code_sent', entity: 'Account', entityId: session.accountId }, request.headers);
    return ok({ sent: true, delivered: result.delivered, retryAfter: result.retryAfter });
  });
}
