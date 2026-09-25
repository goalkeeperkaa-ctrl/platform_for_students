import { z } from 'zod';
import { fail, handle, ok } from '@/lib/api';
import { resolveCrmLink } from '@/lib/services';
import { assertServiceAuth } from '@/lib/security/service-auth';

export const runtime = 'nodejs';

type Params = { params: { employerId: string } };

const bodySchema = z.object({ crmClientId: z.string().trim().min(1) });

/** Одобрение заявки: компания получает crmClientId и входит как клиент CRM. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    assertServiceAuth(request);
    const { crmClientId } = bodySchema.parse(await request.json());

    const resolved = await resolveCrmLink(params.employerId, crmClientId);
    if (!resolved) return fail(404, 'Компания не найдена', 'NOT_FOUND');
    return ok({ resolved: true });
  });
}
