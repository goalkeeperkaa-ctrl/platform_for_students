import { fail, handle, ok } from '@/lib/api';
import { devOutbox, devOutboxAvailable } from '@/lib/mail/transport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Письма, «отправленные» без почтового сервера, — для разработки и сквозной
 * проверки: код подтверждения и ссылку сброса иначе не достать.
 *
 * В production и при настроенной почте маршрута нет: писем в памяти там
 * не бывает, а отдавать чужие коды наружу нельзя.
 */
export async function GET(request: Request) {
  return handle(async () => {
    if (!devOutboxAvailable()) return fail(404, 'Не найдено', 'NOT_FOUND');
    const email = new URL(request.url).searchParams.get('email');
    if (!email) return fail(400, 'Укажите адрес: ?email=…', 'VALIDATION');
    return ok({ messages: devOutbox(email).map(({ subject, text, sentAt }) => ({ subject, text, sentAt })) });
  });
}
