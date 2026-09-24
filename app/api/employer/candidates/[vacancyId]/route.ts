import { z } from 'zod';
import { fail, handle, ok } from '@/lib/api';
import { inviteCandidate, listCandidatesForVacancy } from '@/lib/services';
import { assertSameOrigin, requireEmployer } from '@/lib/security/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: { vacancyId: string } };

/** Кандидаты на вакансию — колода для раздела «Кандидаты». */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { employer } = await requireEmployer();
    const result = await listCandidatesForVacancy(employer.id, params.vacancyId);
    if (!result) return fail(404, 'Вакансия не найдена', 'NOT_FOUND');
    return ok(result);
  });
}

const inviteSchema = z.object({ studentId: z.string().min(1) });

/** Свайп вправо — пригласить кандидата на эту вакансию. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(request);
    const { employer } = await requireEmployer();
    const { studentId } = inviteSchema.parse(await request.json());

    const result = await inviteCandidate(employer.id, params.vacancyId, studentId);
    if (result === 'NOT_FOUND') return fail(404, 'Кандидат или вакансия не найдены', 'NOT_FOUND');
    if (result === 'ALREADY_DECIDED') {
      return ok({ invited: false, reason: 'ALREADY_DECIDED' as const });
    }
    return ok({ invited: true });
  });
}
