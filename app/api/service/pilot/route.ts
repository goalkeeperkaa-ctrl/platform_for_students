import { handle, ok } from '@/lib/api';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { buildPilotMetrics } from '@/lib/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Метрики пилота — только чтение, для вкладки «Пилот» в «Проверках» CRM. */
export async function GET(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    return ok(await buildPilotMetrics());
  });
}
