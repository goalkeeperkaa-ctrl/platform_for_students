import 'server-only';
import { getRedis } from './redis';

/**
 * Скользящее окно по журналу попыток.
 *
 * Фиксированное окно (INCR + EXPIRE) пропускает двойную квоту на стыке
 * двух окон — для формы входа это ровно та дыра, ради которой лимит и
 * ставился. ZSET с отметками времени такого стыка не имеет.
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Через сколько секунд освободится место */
  retryAfter: number;
}

export interface RateLimitRule {
  /** Сколько попыток разрешено в окне */
  limit: number;
  /** Длина окна в секундах */
  windowSeconds: number;
}

/*
 * Пороги подобраны так, чтобы живой человек их не замечал.
 *
 * Ключ по IP здесь не равен «одному человеку». Аудитория платформы —
 * студенты, а кампус, общежитие и корпоративная сеть выходят наружу
 * через один NAT: за адресом стоит не посетитель, а здание. Поэтому
 * пороги по IP рассчитаны на группу людей, а точечная защита от
 * перебора висит отдельно — на самой учётной записи.
 *
 * Второе: в окно попадают и отклонённые попытки. Человек, трижды
 * ошибшийся в форме регистрации, тратит ту же квоту, что и робот, —
 * значит запас должен быть заметно больше числа опечаток.
 */
export const RATE_LIMITS = {
  /** Перебор одной учётной записи — тот порог, который защищает пароль */
  login: { limit: 8, windowSeconds: 300 },
  /** Тот же вход, но на адрес: рассчитан на общий NAT, а не на человека */
  loginIp: { limit: 40, windowSeconds: 300 },
  register: { limit: 20, windowSeconds: 3600 },
  swipe: { limit: 240, windowSeconds: 60 },
  // Живая переписка: человек печатает быстро, но не 60 реплик в минуту
  message: { limit: 60, windowSeconds: 60 },
  upload: { limit: 20, windowSeconds: 600 },
  employerCode: { limit: 10, windowSeconds: 900 },
  sync: { limit: 6, windowSeconds: 3600 },
  // Письмо с кодом: минутную паузу держит сама логика, лимит — от рассылки по кругу
  emailCode: { limit: 6, windowSeconds: 900 },
  // Ввод кода: пять ошибок гасят код, лимит — от перебора со свежими кодами
  emailVerify: { limit: 30, windowSeconds: 900 },
  // Сброс пароля: на адрес — с запасом на общий NAT, на почту — как у входа
  passwordResetIp: { limit: 20, windowSeconds: 3600 },
  passwordReset: { limit: 5, windowSeconds: 3600 },
  // Вход из CRM: билеты разовые и живут минуту, лимит — от перебора подписи
  crmTicket: { limit: 30, windowSeconds: 900 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export async function rateLimit(
  name: RateLimitName,
  identifier: string,
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name];
  const key = `rl:${name}:${identifier}`;
  const now = Date.now();
  const windowStart = now - rule.windowSeconds * 1000;

  const redis = getRedis();
  if (!redis) return memoryLimit(key, rule, now, windowStart);

  try {
    const pipeline = redis.multi();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now, `${now}-${Math.random().toString(36).slice(2, 8)}`);
    pipeline.zcard(key);
    pipeline.pexpire(key, rule.windowSeconds * 1000);
    const results = await pipeline.exec();

    const count = Number(results?.[2]?.[1] ?? 0);
    if (count > rule.limit) {
      const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
      const oldestAt = Number(oldest?.[1] ?? now);
      return {
        ok: false,
        remaining: 0,
        retryAfter: Math.max(1, Math.ceil((oldestAt + rule.windowSeconds * 1000 - now) / 1000)),
      };
    }
    return { ok: true, remaining: rule.limit - count, retryAfter: 0 };
  } catch {
    // Недоступный Redis не должен закрывать вход всем пользователям
    return memoryLimit(key, rule, now, windowStart);
  }
}

const memoryLog = new Map<string, number[]>();

function memoryLimit(
  key: string,
  rule: RateLimitRule,
  now: number,
  windowStart: number,
): RateLimitResult {
  const hits = (memoryLog.get(key) ?? []).filter((t) => t > windowStart);
  hits.push(now);
  memoryLog.set(key, hits);

  if (memoryLog.size > 5000) {
    for (const [k, v] of memoryLog) if (!v.some((t) => t > windowStart)) memoryLog.delete(k);
  }

  if (hits.length > rule.limit) {
    const oldest = hits[0] ?? now;
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((oldest + rule.windowSeconds * 1000 - now) / 1000)),
    };
  }
  return { ok: true, remaining: rule.limit - hits.length, retryAfter: 0 };
}

/** IP из заголовков прокси. Без него лимит был бы общим на всех. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') ?? '127.0.0.1';
}
