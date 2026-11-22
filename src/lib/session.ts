import crypto from 'crypto';
import { cookies } from 'next/headers';

export const TOURIST_COOKIE_NAME = 'tb_tourist_session';
export const ADMIN_COOKIE_NAME = 'tb_admin_session';

export interface TouristSessionPayload {
  memberId: string;
  tripId: string;
  rosterId: string;
  displayName: string;
  sessionToken: string;
  issuedAt: number;
}

export interface AdminSessionPayload {
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'tour_leader';
  issuedAt: number;
}

function getSecret(): string {
  const configured = process.env.LTTBD_SESSION_SECRET || process.env.TOURBUZZ_SESSION_SECRET;
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error('LTTBD_SESSION_SECRET must be configured in production.');
  }
  return configured || 'lttbd-session-signing-secret-2026-secure';
}

export function signPayload(payload: object): string {
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

export function verifySignedPayload<T>(token: string | undefined | null): T | null {
  if (!token || !token.includes('.')) return null;
  const [data, signature] = token.split('.');
  if (!data || !signature) return null;
  const expectedSig = crypto
    .createHmac('sha256', getSecret())
    .update(data)
    .digest('base64url');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const json = Buffer.from(data, 'base64url').toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function getTouristSessionFromCookies(): TouristSessionPayload | null {
  try {
    const cookieStore = cookies();
    const raw = cookieStore.get(TOURIST_COOKIE_NAME)?.value;
    return verifySignedPayload<TouristSessionPayload>(raw);
  } catch {
    return null;
  }
}

export function getAdminSessionFromCookies(): AdminSessionPayload | null {
  try {
    const cookieStore = cookies();
    const raw = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    return verifySignedPayload<AdminSessionPayload>(raw);
  } catch {
    return null;
  }
}
