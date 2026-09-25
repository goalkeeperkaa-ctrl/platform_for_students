import { handle, ok } from '@/lib/api';
import { listCrmLinkRequests } from '@/lib/services';
import { assertServiceAuth } from '@/lib/security/service-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Заявки на привязку к CRM — читает CRM своим сервером, не сотрудник браузером. */
export async function GET(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const requests = await listCrmLinkRequests();
    return ok({ requests });
  });
}
