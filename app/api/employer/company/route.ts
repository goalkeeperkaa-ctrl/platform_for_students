import { cookies } from 'next/headers';
import { fail, handle, ok } from '@/lib/api';
import { companyProfileSchema } from '@/lib/company';
import { isInnExistsError } from '@/lib/db';
import type { EmployerRecord } from '@/lib/db/types';
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

    // Телефон — то, по чему агентство подтверждает компанию, зарегистрированную
    // самой: стереть его значит оставить HR без способа связаться
    if (!employer.crmClientId && !input.phone) {
      return fail(400, 'Укажите телефон для связи', 'VALIDATION', {
        phone: 'Укажите телефон — по нему агентство подтверждает компанию',
      });
    }
    // ИНН проверенной компании меняет только агентство: иначе одобренная
    // компания подменила бы реквизиты без проверки. У клиентов из CRM
    // реквизиты в CRM
    const inn = employer.moderationStatus === 'APPROVED' || employer.crmClientId ? undefined : input.inn;

    let updated: EmployerRecord;
    try {
      updated = await store.employers.updateProfile(employer.id, { ...input, inn });
    } catch (err) {
      if (isInnExistsError(err)) {
        return fail(409, 'Компания с таким ИНН уже зарегистрирована', 'INN_TAKEN', {
          inn: 'Компания с таким ИНН уже есть на платформе',
        });
      }
      throw err;
    }

    // Компания, зарегистрированная сама, после смены названия проходит
    // проверку снова: иначе одобрение одной вывески превращалось бы в
    // публичную страницу под любой другой. Клиентов из CRM это не касается —
    // их название приходит из договора.
    if (!employer.crmClientId && employer.moderationStatus === 'APPROVED' && updated.companyName !== employer.companyName) {
      updated = await store.employers.setModeration(employer.id, { status: 'PENDING', note: null });
      await audit(
        session,
        { action: 'employer.remoderation', entity: 'Employer', entityId: employer.id, meta: { reason: 'renamed' } },
        request.headers,
      );
    }

    // Отклонённая компания поправила страницу — это и есть просьба проверить
    // снова. Иначе после отказа пути назад не было бы: очередь HR показывает
    // только тех, кто ждёт решения
    if (employer.moderationStatus === 'REJECTED') {
      updated = await store.employers.setModeration(employer.id, { status: 'PENDING', note: null });
      await audit(
        session,
        { action: 'employer.remoderation', entity: 'Employer', entityId: employer.id, meta: { reason: 'resubmitted' } },
        request.headers,
      );
    }

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
