import { NextResponse, type NextRequest } from 'next/server';
import { HOME_BY_ROLE, SESSION_COOKIE, verifySession } from '@/lib/security/session';
import type { Role } from '@/lib/types';

/**
 * Разграничение доступа по URL + заголовки безопасности.
 *
 * Middleware закрывает разделы до рендера, но не заменяет проверок в
 * роутах: он знает только путь, а не то, чьи именно данные запрошены.
 * Второй рубеж — guards.ts.
 */

const RULES: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: '/feed', roles: ['STUDENT'] },
  { prefix: '/applications', roles: ['STUDENT'] },
  { prefix: '/skipped', roles: ['STUDENT'] },
  { prefix: '/profile', roles: ['STUDENT'] },
  { prefix: '/employer', roles: ['EMPLOYER'] },
  { prefix: '/admin', roles: ['ADMIN'] },
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const rule = RULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (rule) {
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      // Куда вернуть после входа: иначе человек всегда попадает на витрину
      url.searchParams.set('next', pathname);
      return withSecurityHeaders(NextResponse.redirect(url));
    }
    if (!rule.roles.includes(session.role)) {
      const url = request.nextUrl.clone();
      url.pathname = HOME_BY_ROLE[session.role];
      url.search = '';
      return withSecurityHeaders(NextResponse.redirect(url));
    }
  }

  // Вошедшему на форме входа делать нечего, и на витрину каждый раз
  // заново тоже — уже открывший однажды кабинет должен сразу попадать
  // в него, а не листать главную страницу до тех пор, пока сам не выйдет
  if (
    (pathname === '/' ||
      pathname === '/login' ||
      pathname === '/register' ||
      pathname.startsWith('/register/')) &&
    session
  ) {
    const url = request.nextUrl.clone();
    url.pathname = HOME_BY_ROLE[session.role];
    url.search = '';
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  return withSecurityHeaders(NextResponse.next());
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  );
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  return response;
}

export const config = {
  // Статика и картинки не нуждаются ни в проверке роли, ни в лишнем проходе
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/).*)'],
};
