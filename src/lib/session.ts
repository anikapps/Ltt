import { cookies } from 'next/headers';
import crypto from 'crypto';

export const ADMIN_COOKIE_NAME = 'lttbd_admin_session';
export const TOURIST_COOKIE_NAME = 'lttbd_tourist_session';
export const REMEMBER_ME_COOKIE_NAME = 'lttbd_remember_device';

function getSessionSecret(): string {
  const configured = process.env.LTTBD_SESSION_SECRET || process.env.TOURBUZZ_SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && !configured) {
    throw new Error('LTTBD_SESSION_SECRET environment variable must be configured in production.');
  }
  return configured || 'lttbd-session-signing-secret-2026-secure';
}

export function signPayload(payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySignedPayload<T>(token: string | undefined | null): T | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;

  const expected = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(rawToken).digest('hex');
}

export interface AdminSessionPayload {
  userId?: string;
  email: string;
  name: string;
  role:
    | 'super_admin'
    | 'main_admin'
    | 'trip_organizer'
    | 'tour_manager'
    | 'responder'
    | 'admin'
    | 'tour_leader'
    | 'assistant_leader';
  issuedAt: number;
}

export interface TouristSessionPayload {
  sessionId: string;
  tripId: string;
  memberId: string;
  touristCode: string;
  displayName: string;
  issuedAt: number;
}

export interface RememberedDevicePayload {
  displayName: string;
  maskedIdentifier: string;
  tripId: string;
  tripName: string;
  memberId: string;
  deviceTokenHash: string;
  savedAt: number;
}

export async function getAdminSessionFromCookies(): Promise<AdminSessionPayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  const parsed = verifySignedPayload<AdminSessionPayload>(raw);
  if (!parsed) return null;
  if (Date.now() - parsed.issuedAt > 1000 * 60 * 60 * 12) return null;
  return parsed;
}

export async function getTouristSessionFromCookies(): Promise<TouristSessionPayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(TOURIST_COOKIE_NAME)?.value;
  return verifySignedPayload<TouristSessionPayload>(raw);
}

export async function getRememberedDeviceFromCookies(): Promise<RememberedDevicePayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(REMEMBER_ME_COOKIE_NAME)?.value;
  return verifySignedPayload<RememberedDevicePayload>(raw);
}
