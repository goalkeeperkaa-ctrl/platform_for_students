import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { verifyEmailCode } from '@/lib/account-email';
import { notifyNewApplications } from '@/lib/notify';
import { assertSameOrigin, audit, requireRole } from '@/lib/security/guards';
import { rateLimit } from '@/lib/security/rate-limit';
import { emailCodeSchema } from '@/lib/validation';

export const runtime = 'nodejs';

/** Проверка кода из письма. Пять неверных попыток гасят код — нужен новый. */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireRole('STUDENT', 'EMPLOYER');

    const limit = await rateLimit('emailVerify', session.accountId);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { code } = emailCodeSchema.parse(await request.json());
    const result = await verifyEmailCode(session.accountId, code);

    switch (result.status) {
      case 'VERIFIED':
        await audit(session, { action: 'account.email.verified', entity: 'Account', entityId: session.accountId }, request.headers);
        // Подтверждённая почта могла открыть ожидавшие отклики — компаниям письма
        await notifyNewApplications(result.released);
        return ok({ verified: true, released: result.released.length });
      case 'ALREADY_VERIFIED':
        return ok({ verified: true, released: 0 });
      case 'WRONG':
        return fail(400, `Неверный код. Осталось попыток: ${result.attemptsLeft}`, 'WRONG_CODE', { code: 'Неверный код' });
      case 'LOCKED':
        return fail(429, 'Слишком много неверных попыток — отправьте новый код', 'CODE_LOCKED');
      case 'EXPIRED':
        return fail(410, 'Код устарел — отправьте новый', 'CODE_EXPIRED');
      default:
        return fail(404, 'Действующего кода нет — отправьте новый', 'NO_CODE');
    }
  });
}
