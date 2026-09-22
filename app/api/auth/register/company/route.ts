import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { getStore } from '@/lib/db';
import { companyRegistrationSchema } from '@/lib/company';
import { issuePendingRegistration } from '@/lib/pending-registration';
import { blindIndex } from '@/lib/security/crypto';
import { assertSameOrigin } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

/**
 * Самостоятельная регистрация компании, шаг 1: форма проверена, код отправлен.
 *
 * Кабинет заводится только после верного кода (.../register/company/confirm) —
 * опечатка в почте на этом шаге не занимает ИНН и адрес навсегда, как
 * занимала бы созданная сразу, но неподтверждённая учётная запись.
 *
 * Лимит тот же, что у регистрации студента: одна дверь для массовых
 * регистраций не должна быть шире другой.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);

    const ip = clientIp(request.headers);
    const limit = await rateLimit('register', ip);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const input = companyRegistrationSchema.parse(await request.json());
    const store = await getStore();

    // Почта и ИНН проверяются до отправки кода: иначе письмо ушло бы на
    // регистрацию, которая при подтверждении всё равно будет отвергнута
    const existingEmail = await store.accounts.findByEmailHash(blindIndex(input.email));
    if (existingEmail) {
      return fail(409, 'Аккаунт с такой почтой уже зарегистрирован', 'EMAIL_TAKEN', {
        email: 'Эта почта уже занята',
      });
    }
    const existingInn = await store.employers.findByInn(input.inn);
    if (existingInn) {
      return fail(409, 'Компания с таким ИНН уже зарегистрирована — если это ваша компания, напишите в агентство', 'INN_TAKEN', {
        inn: 'Компания с таким ИНН уже есть на платформе',
      });
    }

    const { token, delivered } = await issuePendingRegistration('employer', input.email, input);
    return ok({ pending: token, delivered }, { status: 201 });
  });
}
