import 'server-only';
import { EventEmitter } from 'node:events';
import { getRedis } from '@/lib/security/redis';
import type { MessageAuthor } from '@/lib/types';

/**
 * Шина событий переписки.
 *
 * Нужна, чтобы открытая вкладка узнавала о новом сообщении сама, а не по
 * таймеру. С Redis события расходятся между инстансами; без него —
 * внутри процесса, чего достаточно для одной машины в разработке.
 *
 * Подписчик Redis один на процесс: отдельное соединение на каждую
 * открытую вкладку исчерпало бы пул на первой сотне пользователей.
 * Он перекладывает сообщения в локальный эмиттер, а уже на него
 * подписываются потоки.
 */

const CHANNEL = 'fhr:threads';

export interface ThreadEvent {
  kind: 'message' | 'read';
  applicationId: string;
  /** Кому адресовано. Без этой пары событие ушло бы всем подряд. */
  recipientRole: MessageAuthor;
  recipientId: string;
}

/**
 * Эмиттер и флаги моста живут в globalThis, а не в переменных модуля.
 *
 * В dev Next переинициализирует модули, и здесь это не косметика.
 * Открытый SSE-поток остаётся подписанным на прежний эмиттер, а
 * `publishThreadEvent` уже публикует в новый: сообщение сохраняется
 * и появляется только после обновления страницы. Со стороны это
 * выглядит не как поломка, а как задержка сети, поэтому и не находится.
 */
const globalForEvents = globalThis as unknown as {
  fhrEvents?: EventEmitter;
  fhrEventsBridged?: boolean;
  fhrEventsWarned?: boolean;
};

const local = (globalForEvents.fhrEvents ??= new EventEmitter());
// Слушателей столько же, сколько открытых вкладок: предупреждение Node
// о «возможной утечке» здесь было бы ложной тревогой
local.setMaxListeners(0);

/**
 * Сообщаем о недоступном Redis один раз за процесс.
 *
 * Соединение переподключается по стратегии клиента и на каждой попытке
 * шлёт «error». Без этого фильтра лог превращается в стену из одной и
 * той же строки, в которой тонут настоящие ошибки.
 */
function warnBridgeDown(reason: string): void {
  if (globalForEvents.fhrEventsWarned) return;
  globalForEvents.fhrEventsWarned = true;
  console.warn(
    `[events] Redis недоступен (${reason || 'соединение отклонено'}) — ` +
      'события переписки доставляются в пределах процесса',
  );
}

function ensureBridge(): void {
  if (globalForEvents.fhrEventsBridged) return;
  globalForEvents.fhrEventsBridged = true;

  const redis = getRedis();
  if (!redis) return; // без Redis локального эмиттера достаточно

  try {
    // Подписанное соединение не может выполнять другие команды — нужен дубль
    const sub = redis.duplicate();

    // Обработчик ошибок вешаем до подписки: у дубля свой поток ошибок, и
    // соединение, оставшееся без слушателя, роняет процесс целиком.
    sub.on('error', (err: Error) => warnBridgeDown(err.message));

    sub.on('message', (_channel: string, payload: string) => {
      try {
        local.emit('event', JSON.parse(payload) as ThreadEvent);
      } catch {
        /* битый payload не должен ронять поток */
      }
    });

    // `.catch`, а не `void`: отклонённый промис подписки — это
    // unhandledRejection, который в Next.js обрывает сам SSE-запрос. Но
    // отсутствие Redis не ошибка: переписка продолжает работать через
    // локальный эмиттер, и поток обязан открыться в любом случае.
    sub.subscribe(CHANNEL).catch((err: Error) => warnBridgeDown(err?.message));
  } catch (err) {
    warnBridgeDown(err instanceof Error ? err.message : String(err));
  }
}

export async function publishThreadEvent(event: ThreadEvent): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      // Публикуем только в Redis: обратно событие придёт через мост,
      // иначе слушатели этого процесса получили бы его дважды
      await redis.publish(CHANNEL, JSON.stringify(event));
      return;
    } catch {
      /* Redis отвалился — доставим хотя бы внутри процесса */
    }
  }
  local.emit('event', event);
}

/** Подписка на события для одного получателя. Возвращает отписку. */
export function subscribeThreadEvents(
  recipient: { role: MessageAuthor; profileId: string },
  handler: (event: ThreadEvent) => void,
): () => void {
  ensureBridge();
  const listener = (event: ThreadEvent) => {
    if (event.recipientRole !== recipient.role) return;
    if (event.recipientId !== recipient.profileId) return;
    handler(event);
  };
  local.on('event', listener);
  return () => {
    local.off('event', listener);
  };
}
