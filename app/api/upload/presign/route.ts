import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { assertSameOrigin, getSession } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { presignUpload } from '@/lib/storage';
import { UPLOAD_LIMITS, type UploadKind } from '@/lib/validation';

export const runtime = 'nodejs';

const PRESIGN_KINDS: readonly UploadKind[] = ['companyVideo', 'studentVideo'];

/**
 * Подписанная ссылка для загрузки видео напрямую в S3.
 *
 * Функции Vercel режут тело запроса на 4.5 МБ — видео до 50 МБ обычным
 * POST на наш сервер (как storeUpload()) не доедет. Поэтому здесь только
 * выдаётся ссылка с подписью, а сам файл клиент льёт прямо в S3, минуя
 * наш сервер. Без S3 (разработка) отвечаем отказом — клиент в этом
 * случае переключается на обычную загрузку через /api/upload.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);

    const limit = await rateLimit('upload', clientIp(request.headers));
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const body = (await request.json().catch(() => null)) as { kind?: string; mime?: string; size?: number } | null;
    const kind = String(body?.kind ?? '');
    const mime = String(body?.mime ?? '');
    const size = Number(body?.size ?? 0);

    if (!PRESIGN_KINDS.includes(kind as UploadKind)) {
      return fail(400, 'Неизвестный тип загрузки', 'BAD_KIND');
    }
    const limits = UPLOAD_LIMITS[kind as UploadKind];
    if (!(limits.mime as readonly string[]).includes(mime)) {
      return fail(415, `Неподходящий формат. Нужен ${limits.label}`, 'BAD_MIME');
    }
    if (!Number.isFinite(size) || size <= 0 || size > limits.maxBytes) {
      return fail(413, `Файл слишком большой. Нужен ${limits.label}`, 'TOO_LARGE');
    }

    if (kind === 'companyVideo') {
      const session = await getSession();
      if (!session || session.role !== 'EMPLOYER') {
        return fail(401, 'Загружать видео компании может только её кабинет', 'UNAUTHORIZED');
      }
    }
    if (kind === 'studentVideo') {
      const session = await getSession();
      if (!session || session.role !== 'STUDENT') {
        return fail(401, 'Видео-визитку загружает студент из своего профиля', 'UNAUTHORIZED');
      }
    }

    const presigned = await presignUpload(kind as UploadKind, mime);
    if (!presigned) {
      return fail(501, 'Прямая загрузка видео недоступна без S3', 'NO_S3');
    }

    return ok(presigned, { status: 201 });
  });
}
