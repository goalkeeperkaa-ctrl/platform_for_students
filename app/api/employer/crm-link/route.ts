import { z } from 'zod';
import { fail, handle, ok } from '@/lib/api';
import { requestCrmLink } from '@/lib/services';
import { assertSameOrigin, requireEmployer } from '@/lib/security/guards';

export const runtime = 'nodejs';

const bodySchema = z.object({ note: z.string().trim().max(500).optional() });

/**
 * Заявка «объедините с профилем в CRM» — от компании, зарегистрированной
 * самостоятельно. Решает её сотрудник CRM (см. app/api/service/crm-links);
 * здесь только приём заявки, без результата сразу.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { employer } = await requireEmployer();
    const { note } = bodySchema.parse(await request.json());

    if (employer.crmClientId) {
      return fail(409, 'Профиль уже объединён с CRM', 'ALREADY_LINKED');
    }

    await requestCrmLink(employer.id, note?.trim() || null);
    return ok({ requested: true });
  });
}
