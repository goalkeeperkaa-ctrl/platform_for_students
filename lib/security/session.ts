import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { readStaffPermissions, type StaffPermission } from '@/lib/staff-permissions';
import type { Role, SessionUser } from '@/lib/types';

/**
 * Сессия на JWT в httpOnly-куке.
 *
 * jose, а не jsonwebtoken: тот же код должен работать и в Node-рантайме
 * роутов, и в middleware на edge, где node:crypto недоступен. Проверка
 * подписи в middleware — единственный способ не пускать в защищённые
 * разделы до рендера.
 */

export const SESSION_COOKIE = 'fhr_session';
const ISSUER = 'fattakhov-students';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // две недели

const DEV_SECRET = 'fattakhov-dev-jwt-secret-change-me-in-production';

function secret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET не задан или короче 32 символов. Сгенерируйте: npm run keys');
    }
    return new TextEncoder().encode(DEV_SECRET);
  }
  return new TextEncoder().encode(raw);
}

export interface SessionClaims extends JWTPayload {
  role: Role;
  profileId: string | null;
  name: string;
  /** Разделы панели HR у сотрудника, вошедшего из CRM */
  permissions?: StaffPermission[];
}

/** Срок — две недели; сотруднику из CRM вызывающий передаёт рабочий день. */
export async function signSession(user: SessionUser, maxAgeSeconds: number = MAX_AGE_SECONDS): Promise<string> {
  const claims = {
    role: user.role,
    profileId: user.profileId,
    name: user.name,
    // У HR-учётки, заведённой здесь, списка разделов нет — ей открыто всё
    ...(user.permissions ? { permissions: user.permissions } : {}),
  } satisfies Omit<SessionClaims, keyof JWTPayload>;

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.accountId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionClaims>(token, secret(), { issuer: ISSUER });
    if (!payload.sub || !payload.role) return null;
    const permissions = payload.role === 'ADMIN' ? readStaffPermissions(payload.permissions) : undefined;
    return {
      accountId: payload.sub,
      role: payload.role,
      profileId: payload.profileId ?? null,
      name: payload.name ?? '',
      ...(permissions ? { permissions } : {}),
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE_SECONDS,
};

/** Куда отправлять роль после входа — одно место правды для всех редиректов. */
export const HOME_BY_ROLE: Record<Role, string> = {
  STUDENT: '/feed',
  EMPLOYER: '/employer',
  ADMIN: '/admin',
};
