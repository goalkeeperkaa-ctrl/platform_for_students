import { handle, ok } from '@/lib/api';
import { listInstitutionOptions } from '@/lib/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Справочник вузов для подсказок при вводе.
 *
 * Открыт без входа: он нужен на регистрации, до создания аккаунта. В нём
 * нет ничего о студентах — только названия и города учреждений.
 */
export async function GET() {
  return handle(async () => ok({ institutions: await listInstitutionOptions() }));
}
