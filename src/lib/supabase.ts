import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return (
    url.startsWith('https://') &&
    !url.includes('your-project-id') &&
    serviceKey.length > 20 &&
    !serviceKey.includes('your-supabase-service-role')
  );
}

/**
 * Server-only Supabase client using Service Role key.
 * NEVER import this into client components.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

/**
 * Browser-safe Supabase client for Realtime subscriptions when configured.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (
    !url.startsWith('https://') ||
    url.includes('your-project-id') ||
    anonKey.length < 20 ||
    anonKey.includes('your-supabase-anon')
  ) {
    return null;
  }
  return createClient(url, anonKey);
}
