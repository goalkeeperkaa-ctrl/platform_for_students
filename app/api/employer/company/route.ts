import { cookies } from 'next/headers';
import { handle, ok } from '@/lib/api';
import { companyProfileSchema } from '@/lib/company';
import { assertSameOrigin, audit, requireEmployer } from '@/lib/security/guards';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/security/session';
import type { SessionUser } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * Страница своей компании.
 *
 * Идентификатор компании берётся из сессии, а не из запроса: приняв его
 * снаружи, пришлось бы на каждой ветке сверять, чья это компания, и
 * однажды сверка потерялась бы.
 *
 * Картинки проверены схемой: это только файлы вида `company`, а не любой
 * путь — иначе через логотип можно было бы открыть публично фото студента.
 */
export async function PATCH(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { session, employer, store } = await requireEmployer();

    const input = companyProfileSchema.parse(await request.json());
    const updated = await store.employers.updateProfile(employer.id, input);

    // Название компании — в сессионном токене, шапка берёт его оттуда.
    // Без переподписи новое название появилось бы только после перевхода.
    if (updated.companyName !== session.name) {
      const next: SessionUser = { ...session, name: updated.companyName };
      cookies().set(SESSION_COOKIE, await signSession(next), sessionCookieOptions);
    }

    await audit(
      session,
      { action: 'employer.profile.updated', entity: 'Employer', entityId: employer.id },
      request.headers,
    );

    return ok({ moderationStatus: updated.moderationStatus, companyName: updated.companyName });
  });
}
