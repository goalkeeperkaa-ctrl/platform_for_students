import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { getStore } from '@/lib/db';
import { issuePendingRegistration, type PendingStudentData } from '@/lib/pending-registration';
import { blindIndex } from '@/lib/security/crypto';
import { assertSameOrigin } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { registrationSchema } from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * Регистрация студента, шаг 1: форма проверена, код отправлен.
 *
 * Учётная запись заводится только после верного кода (.../register/confirm).
 * Опечатка в почте на этом шаге не занимает адрес навсегда, как занимала
 * бы созданная сразу, но неподтверждённая учётная запись.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);

    const ip = clientIp(request.headers);
    const limit = await rateLimit('register', ip);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const input = registrationSchema.parse(await request.json());
    const store = await getStore();

    // Вуз из справочника сверяется с базой, и название берётся оттуда, а не
    // из поля ввода: иначе «вышка» и «НИУ ВШЭ» считались бы разными вузами
    const institution = input.institutionId ? await store.institutions.findById(input.institutionId) : null;
    if (input.institutionId && !institution) {
      return fail(400, 'Вуз из списка не найден — выберите его заново на шаге «Где вы учитесь»', 'VALIDATION', {
        university: 'Выберите вуз из списка заново',
      });
    }

    // Почта проверяется до отправки кода: иначе письмо ушло бы на адрес,
    // который уже занят, а человек узнал бы об этом только после ввода кода
    const existing = await store.accounts.findByEmailHash(blindIndex(input.email));
    if (existing) {
      return fail(409, 'Аккаунт с такой почтой уже зарегистрирован', 'EMAIL_TAKEN', {
        email: 'Эта почта уже занята',
      });
    }

    const data: PendingStudentData = {
      ...input,
      university: institution ? (institution.shortName ?? institution.name) : input.university,
      institutionId: institution?.id ?? null,
      consentIp: ip,
    };

    const { token, delivered } = await issuePendingRegistration('student', input.email, data);
    return ok({ pending: token, delivered }, { status: 201 });
  });
}
