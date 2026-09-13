import { handle, ok } from '@/lib/api';
import { requireRole } from '@/lib/security/guards';
import { buildPilotMetrics } from '@/lib/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Метрики пилота и журнал событий — только для HR агентства. */
export async function GET() {
  return handle(async () => {
    await requireRole('ADMIN');
    return ok(await buildPilotMetrics());
  });
}
