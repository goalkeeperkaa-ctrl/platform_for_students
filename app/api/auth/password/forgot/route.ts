import { handle, ok, tooManyRequests } from '@/lib/api';
import { requestPasswordReset } from '@/lib/account-email';
import { blindIndex } from '@/lib/security/crypto';
import { assertSameOrigin, audit } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { forgotPasswordSchema } from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * «Забыли пароль»: письмо со ссылкой.
 *
 * Ответ одинаковый для любой почты — есть такая учётка или нет. Иначе форма
 * стала бы способом проверить, зарегистрирован ли человек на платформе.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);

    const byIp = await rateLimit('passwordResetIp', clientIp(request.headers));
    if (!byIp.ok) return tooManyRequests(byIp.retryAfter);

    const { email } = forgotPasswordSchema.parse(await request.json());
    const emailHash = blindIndex(email);
    const byAccount = await rateLimit('passwordReset', `acct:${emailHash}`);
    if (!byAccount.ok) return tooManyRequests(byAccount.retryAfter);

    await requestPasswordReset(email);
    await audit(null, { action: 'auth.password.reset_requested', meta: { emailHash } }, request.headers);

    return ok({ sent: true });
  });
}
