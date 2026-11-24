import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function getSupabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
}

/**
 * Supports both new Supabase Publishable Keys (`sb_publishable_...`)
 * and legacy `anon` public keys.
 */
export function getSupabasePublicKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();
}

/**
 * Supports both new Supabase Secret Keys (`sb_secret_...`)
 * and legacy `service_role` secret keys. Server-only.
 */
export function getSupabaseSecretKey(): string {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const secretKey = getSupabaseSecretKey();
  return (
    url.startsWith('https://') &&
    !url.includes('your-project-id') &&
    secretKey.length > 20 &&
    !secretKey.includes('your-supabase-service-role') &&
    !secretKey.includes('your-supabase-secret')
  );
}

/**
 * Server-only Supabase client using Secret / Service Role key.
 * NEVER import this into client components.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  return createClient(getSupabaseUrl(), getSupabaseSecretKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

/**
 * Browser-safe Supabase client for Realtime Broadcast & Presence.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const pubKey = getSupabasePublicKey();
  if (
    !url.startsWith('https://') ||
    url.includes('your-project-id') ||
    pubKey.length < 20 ||
    pubKey.includes('your-supabase-anon') ||
    pubKey.includes('your-supabase-publishable')
  ) {
    return null;
  }
  return createClient(url, pubKey, {
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  });
}
