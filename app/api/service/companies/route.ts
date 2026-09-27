import { handle, ok } from '@/lib/api';
import { listApprovedCompanies } from '@/lib/services';
import { assertServiceAuth } from '@/lib/security/service-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Одобренные компании без клиента в CRM и без заявки на привязку — читает
 * CRM своим сервером, чтобы показать их среди клиентов (с отдельной
 * пометкой), а не только тех, кто сам попросил объединить профиль.
 */
export async function GET(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const companies = await listApprovedCompanies();
    return ok({ companies });
  });
}
