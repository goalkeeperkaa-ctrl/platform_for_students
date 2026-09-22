import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { resendPendingRegistration } from '@/lib/pending-registration';
import { assertSameOrigin } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const resendSchema = z.object({ pending: z.string().min(1).max(4000) });

/** Код ещё раз — без пересборки формы регистрации компании. */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);

    const limit = await rateLimit('registerResend', clientIp(request.headers));
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { pending } = resendSchema.parse(await request.json());
    const result = await resendPendingRegistration('employer', pending);

    if (result.status === 'WAIT') {
      return NextResponse.json(
        { error: `Повторная отправка через ${result.retryAfter} с`, code: 'CODE_WAIT', retryAfter: result.retryAfter },
        { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
      );
    }
    if (result.status === 'BAD_TOKEN') {
      return fail(410, 'Время на подтверждение истекло. Начните регистрацию заново.', 'CODE_EXPIRED');
    }

    return ok({ pending: result.token, delivered: result.delivered, retryAfter: result.retryAfter });
  });
}
