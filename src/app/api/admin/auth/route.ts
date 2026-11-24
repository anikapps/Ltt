import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_COOKIE_NAME,
  signPayload,
  getAdminSessionFromCookies,
  AdminSessionPayload
} from '@/lib/session';
import { getSupabaseAdminClient } from '@/lib/supabase';

export async function GET() {
  const session = await getAdminSessionFromCookies();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, admin: session });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Please enter both administrator email and password.' },
        { status: 400 }
      );
    }

    const sb = getSupabaseAdminClient();
    let userId: string | undefined;
    let adminName = 'LTT BD Administrator';
    let role: AdminSessionPayload['role'] = 'super_admin';

    if (sb) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        return NextResponse.json(
          { error: 'Invalid administrator credentials.' },
          { status: 401 }
        );
      }

      userId = data.user.id;
      adminName = data.user.user_metadata?.full_name || email;

      // Resolve authoritative RBAC role from public.profiles if present
      const { data: profile } = await sb
        .from('profiles')
        .select('full_name, role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile) {
        adminName = profile.full_name || adminName;
        if (profile.role === 'tourist') {
          return NextResponse.json(
            { error: 'This account does not have operations administrator access.' },
            { status: 403 }
          );
        }
        role = profile.role as AdminSessionPayload['role'];
      } else {
        // Bootstrap profile for authenticated Supabase Auth operator if missing
        await sb.from('profiles').upsert({
          id: data.user.id,
          email,
          full_name: adminName,
          role: 'super_admin'
        });
      }

      await sb.from('audit_logs').insert({
        trip_id: null,
        actor_label: `${adminName} (${email})`,
        action: 'ADMIN_LOGIN',
        details: { role }
      });
    } else {
      const configuredEmail = process.env.LTTBD_DEFAULT_ADMIN_EMAIL || process.env.TOURBUZZ_DEFAULT_ADMIN_EMAIL;
      const configuredPassword = process.env.LTTBD_DEFAULT_ADMIN_PASSWORD || process.env.TOURBUZZ_DEFAULT_ADMIN_PASSWORD;

      if (!configuredEmail || !configuredPassword) {
        return NextResponse.json(
          { error: 'Administrator authentication is not configured. Run setup or configure Supabase Auth.' },
          { status: 503 }
        );
      }

      if (email !== configuredEmail.toLowerCase() || password !== configuredPassword) {
        return NextResponse.json(
          { error: 'Invalid administrator credentials.' },
          { status: 401 }
        );
      }
      adminName = 'LTT BD Operations';
      role = 'super_admin';
    }

    const payload: AdminSessionPayload = {
      userId,
      email,
      name: adminName,
      role,
      issuedAt: Date.now()
    };

    const signed = signPayload(payload);
    const res = NextResponse.json({ authenticated: true, admin: payload });
    res.cookies.set(ADMIN_COOKIE_NAME, signed, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 12
    });
    return res;
  } catch {
    return NextResponse.json({ error: 'Authentication request failed.' }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await getAdminSessionFromCookies();
  const sb = getSupabaseAdminClient();
  if (sb && session) {
    await sb.from('audit_logs').insert({
      trip_id: null,
      actor_label: `${session.name} (${session.email})`,
      action: 'ADMIN_LOGOUT',
      details: { role: session.role }
    });
  }
  const res = NextResponse.json({ authenticated: false });
  res.cookies.delete(ADMIN_COOKIE_NAME);
  return res;
}
