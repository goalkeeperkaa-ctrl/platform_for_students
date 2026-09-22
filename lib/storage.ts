import 'server-only';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { UPLOAD_LIMITS, type UploadKind } from '@/lib/validation';
import { HttpError } from '@/lib/security/guards';

/**
 * Хранилище загруженных файлов.
 *
 * Файлы кладутся вне `public/`: всё, что попадает в public, раздаётся
 * статикой по предсказуемому пути и индексируется. Резюме и фото —
 * персональные данные, они обязаны идти через роут, где можно спросить,
 * кто их запрашивает.
 *
 * Диск — только для локальной разработки. На Vercel (и любом другом
 * serverless-хостинге) файловая система либо только для чтения, либо
 * живёт не дольше одного вызова функции: записанный файл читается
 * только внутри того же запроса и пропадает бесследно при следующем —
 * ровно то, что раньше не давало загрузить резюме при регистрации.
 * Если заданы S3_* (тот же набор переменных, что и на сайте агентства),
 * файлы идут в S3-совместимое хранилище; без них — как раньше, на диск.
 */

const ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), '.uploads');

type S3Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

/**
 * Настройки S3 из окружения. Пусто — работаем с диском (разработка).
 * Задано наполовину — громкая ошибка: молча свалиться на диск на
 * проде значит потерять файлы при первом же перезапуске сервера.
 */
function s3ConfigFromEnv(): S3Config | null {
  const fields = {
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  };

  const set = Object.entries(fields).filter(([, v]) => Boolean(v));
  if (set.length === 0) return null;

  const missing = Object.entries(fields)
    .filter(([, v]) => !v)
    .map(([k]) => `S3_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`);
  if (missing.length > 0) {
    throw new Error(
      `Хранилище S3 настроено наполовину. Не заданы: ${missing.join(', ')}. ` +
        'Либо задайте все переменные, либо уберите все.',
    );
  }

  return {
    endpoint: fields.endpoint!,
    bucket: fields.bucket!,
    accessKeyId: fields.accessKeyId!,
    secretAccessKey: fields.secretAccessKey!,
    region: process.env.S3_REGION ?? 'ru-central1',
  };
}

let cachedClient: { client: S3Client; bucket: string } | null | undefined;

/** undefined — ещё не проверяли, null — S3 не настроен (работаем с диском). */
function s3Client(): { client: S3Client; bucket: string } | null {
  if (cachedClient !== undefined) return cachedClient;
  const config = s3ConfigFromEnv();
  if (!config) {
    cachedClient = null;
    return null;
  }
  cachedClient = {
    bucket: config.bucket,
    // Яндекс и большинство российских провайдеров работают по пути,
    // а не по поддомену бакета: без forcePathStyle запросы уходят в никуда
    client: new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      forcePathStyle: true,
    }),
  };
  return cachedClient;
}

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export interface StoredFile {
  /** Путь для клиента: /api/files/<kind>/<name> */
  url: string;
  name: string;
  size: number;
}

export async function storeUpload(kind: UploadKind, file: File): Promise<StoredFile> {
  const limits = UPLOAD_LIMITS[kind];

  if (!(limits.mime as readonly string[]).includes(file.type)) {
    throw new HttpError(415, `Неподходящий формат. Нужен ${limits.label}`, 'BAD_MIME');
  }
  if (file.size > limits.maxBytes) {
    throw new HttpError(413, `Файл слишком большой. Нужен ${limits.label}`, 'TOO_LARGE');
  }
  if (file.size === 0) {
    throw new HttpError(400, 'Файл пустой', 'EMPTY_FILE');
  }

  // Имя генерируем сами: исходное имя файла — это ввод пользователя,
  // и в нём может быть и обход каталога, и что угодно ещё.
  const stored = `${randomUUID()}.${EXTENSION[file.type] ?? 'bin'}`;
  const body = Buffer.from(await file.arrayBuffer());

  const s3 = s3Client();
  if (s3) {
    await s3.client.send(
      new PutObjectCommand({
        Bucket: s3.bucket,
        Key: `${kind}/${stored}`,
        Body: body,
        ContentType: file.type,
      }),
    );
  } else {
    const dir = path.join(ROOT, kind);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, stored), body);
  }

  return {
    url: `/api/files/${kind}/${stored}`,
    name: sanitizeDisplayName(file.name),
    size: file.size,
  };
}

/**
 * Прямая загрузка в S3 по подписанной ссылке — для видео.
 *
 * Функции на Vercel режут тело запроса на 4.5 МБ: видео до 50 МБ через
 * `storeUpload()` (обычный POST на наш сервер) попросту не доедет. Клиент
 * поэтому льёт файл сразу в S3 по ссылке с подписью, минуя наш сервер;
 * здесь только выдаём эту ссылку и заранее знаем итоговый публичный адрес.
 * Без S3 (разработка) прямой загрузки нет — используется storeUpload().
 */
export async function presignUpload(
  kind: UploadKind,
  mimeType: string,
): Promise<{ uploadUrl: string; url: string } | null> {
  const s3 = s3Client();
  if (!s3) return null;

  const ext = EXTENSION[mimeType] ?? 'bin';
  const stored = `${randomUUID()}.${ext}`;
  const uploadUrl = await getSignedUrl(
    s3.client,
    new PutObjectCommand({ Bucket: s3.bucket, Key: `${kind}/${stored}`, ContentType: mimeType }),
    { expiresIn: 300 },
  );

  return { uploadUrl, url: `/api/files/${kind}/${stored}` };
}

const NAME_PATTERN = /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i;

function typeFromName(name: string): string {
  const ext = path.extname(name).slice(1).toLowerCase();
  return Object.entries(EXTENSION).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
}

export async function readStored(kind: string, name: string): Promise<{ body: Buffer; type: string }> {
  // Оба сегмента сверяются с белым списком, а не «очищаются»: обход каталога
  // должен быть невозможен по построению, а не по фильтру.
  if (!Object.prototype.hasOwnProperty.call(UPLOAD_LIMITS, kind) || !NAME_PATTERN.test(name)) {
    throw new HttpError(404, 'Файл не найден', 'NOT_FOUND');
  }

  const s3 = s3Client();
  if (s3) {
    try {
      const result = await s3.client.send(
        new GetObjectCommand({ Bucket: s3.bucket, Key: `${kind}/${name}` }),
      );
      if (!result.Body) throw new Error('empty body');
      const bytes = await result.Body.transformToByteArray();
      return { body: Buffer.from(bytes), type: typeFromName(name) };
    } catch {
      throw new HttpError(404, 'Файл не найден', 'NOT_FOUND');
    }
  }

  const full = path.join(ROOT, kind, name);
  if (!full.startsWith(ROOT + path.sep)) {
    throw new HttpError(404, 'Файл не найден', 'NOT_FOUND');
  }

  try {
    const body = await readFile(full);
    return { body, type: typeFromName(name) };
  } catch {
    throw new HttpError(404, 'Файл не найден', 'NOT_FOUND');
  }
}

/**
 * Имя файла показывается студенту, работодателю и админу. Список
 * разрешённого, а не запрещённого: так в подпись не просочится ни
 * разметка, ни управляющие символы, ни RTL-override, которым маскируют
 * расширение.
 */
function sanitizeDisplayName(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N} ._()-]/gu, '').trim();
  return cleaned.slice(0, 120) || 'Файл';
}

/**
 * Удалить загруженный файл по его адресу. Отсутствующий файл — не ошибка:
 * результат тот же, что и просили. Путь сверяется с тем же белым списком,
 * что и при чтении, — удалить что-то вне каталога загрузок нельзя.
 */
export async function deleteStored(url: string): Promise<void> {
  const match = /^\/api\/files\/([a-z]+)\/([^/]+)$/.exec(url);
  if (!match) return;
  const [, kind, name] = match;
  if (!Object.prototype.hasOwnProperty.call(UPLOAD_LIMITS, kind) || !NAME_PATTERN.test(name)) return;

  const s3 = s3Client();
  if (s3) {
    await s3.client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: `${kind}/${name}` }));
    return;
  }

  const full = path.join(ROOT, kind, name);
  if (!full.startsWith(ROOT + path.sep)) return;
  await unlink(full).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}
