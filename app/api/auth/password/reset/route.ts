import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { resetPassword } from '@/lib/account-email';
import { assertSameOrigin, audit } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { resetPasswordSchema } from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * Новый пароль по ссылке из письма. Ссылка одноразовая; после смены
 * человек входит сам — сессию по ссылке из письма не выдаём.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);

    const limit = await rateLimit('passwordResetIp', clientIp(request.headers));
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { token, password } = resetPasswordSchema.parse(await request.json());
    const result = await resetPassword(token, password);

    if (result.status === 'EXPIRED') return fail(410, 'Ссылка устарела — запросите новую', 'TOKEN_EXPIRED');
    if (result.status === 'INVALID') {
      return fail(400, 'Ссылка недействительна или уже использована — запросите новую', 'BAD_TOKEN');
    }

    await audit(
      null,
      { action: 'auth.password.reset', entity: 'Account', entityId: result.accountId, meta: { role: result.role } },
      request.headers,
    );
    return ok({ redirectTo: '/login?reset=1' });
  });
}
