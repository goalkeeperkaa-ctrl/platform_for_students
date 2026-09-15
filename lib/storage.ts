import 'server-only';
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
 */

const ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), '.uploads');

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
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

  const dir = path.join(ROOT, kind);
  await mkdir(dir, { recursive: true });

  // Имя генерируем сами: исходное имя файла — это ввод пользователя,
  // и в нём может быть и обход каталога, и что угодно ещё.
  const stored = `${randomUUID()}.${EXTENSION[file.type] ?? 'bin'}`;
  await writeFile(path.join(dir, stored), Buffer.from(await file.arrayBuffer()));

  return {
    url: `/api/files/${kind}/${stored}`,
    name: sanitizeDisplayName(file.name),
    size: file.size,
  };
}

const NAME_PATTERN = /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i;

export async function readStored(kind: string, name: string): Promise<{ body: Buffer; type: string }> {
  // Оба сегмента сверяются с белым списком, а не «очищаются»: обход каталога
  // должен быть невозможен по построению, а не по фильтру.
  if (!Object.prototype.hasOwnProperty.call(UPLOAD_LIMITS, kind) || !NAME_PATTERN.test(name)) {
    throw new HttpError(404, 'Файл не найден', 'NOT_FOUND');
  }

  const full = path.join(ROOT, kind, name);
  if (!full.startsWith(ROOT + path.sep)) {
    throw new HttpError(404, 'Файл не найден', 'NOT_FOUND');
  }

  try {
    const body = await readFile(full);
    const ext = path.extname(name).slice(1).toLowerCase();
    const type =
      Object.entries(EXTENSION).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
    return { body, type };
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
  const full = path.join(ROOT, kind, name);
  if (!full.startsWith(ROOT + path.sep)) return;
  await unlink(full).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}
