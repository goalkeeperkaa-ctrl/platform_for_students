import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { assertSameOrigin, audit, getSession } from '@/lib/security/guards';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { storeUpload } from '@/lib/storage';
import { UPLOAD_LIMITS, type UploadKind } from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * Приём фото, резюме, изображений компании и справок об обучении.
 *
 * Сессии для фото и резюме может не быть: их прикладывают на шагах мастера,
 * до создания аккаунта. Поэтому для них единственный барьер — лимит по IP, а
 * сам файл проверяется по типу и размеру до записи на диск.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);

    const limit = await rateLimit('upload', clientIp(request.headers));
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const form = await request.formData();
    const kind = String(form.get('kind') ?? '');
    const file = form.get('file');

    if (!Object.prototype.hasOwnProperty.call(UPLOAD_LIMITS, kind)) {
      return fail(400, 'Неизвестный тип загрузки', 'BAD_KIND');
    }
    // Файлы компании раздаются публично, поэтому загружать их может только
    // вошедший работодатель. Без этого кто угодно складывал бы на сервер
    // картинки, которые потом открываются без входа.
    if (kind === 'company') {
      const session = await getSession();
      if (!session || session.role !== 'EMPLOYER') {
        return fail(401, 'Загружать изображения компании может только её кабинет', 'UNAUTHORIZED');
      }
    }
    // Справку прикладывает студент из профиля: она привязывается к учётной
    // записи, и без входа ей не к чему привязаться
    if (kind === 'study') {
      const session = await getSession();
      if (!session || session.role !== 'STUDENT') {
        return fail(401, 'Справку загружает студент из своего профиля', 'UNAUTHORIZED');
      }
    }
    if (!(file instanceof File)) {
      return fail(400, 'Файл не передан', 'NO_FILE');
    }

    const stored = await storeUpload(kind as UploadKind, file);
    await audit(await getSession(), { action: 'file.uploaded', meta: { kind, size: stored.size } }, request.headers);

    return ok(stored, { status: 201 });
  });
}
