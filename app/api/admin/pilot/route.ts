import { handle, ok } from '@/lib/api';
import { requireStaff } from '@/lib/security/guards';
import { buildPilotMetrics } from '@/lib/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Метрики пилота и журнал событий — только для HR агентства. */
export async function GET() {
  return handle(async () => {
    await requireStaff('pilot');
    return ok(await buildPilotMetrics());
  });
}
