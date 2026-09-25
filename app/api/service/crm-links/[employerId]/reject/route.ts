import { z } from 'zod';
import { fail, handle, ok } from '@/lib/api';
import { rejectCrmLink } from '@/lib/services';
import { assertServiceAuth } from '@/lib/security/service-auth';

export const runtime = 'nodejs';

type Params = { params: { employerId: string } };

const bodySchema = z.object({ note: z.string().trim().min(1).max(500) });

/** Отказ с пояснением — компания увидит его у себя и сможет подать заявку снова. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    assertServiceAuth(request);
    const { note } = bodySchema.parse(await request.json());

    const rejected = await rejectCrmLink(params.employerId, note);
    if (!rejected) return fail(404, 'Компания не найдена', 'NOT_FOUND');
    return ok({ rejected: true });
  });
}
