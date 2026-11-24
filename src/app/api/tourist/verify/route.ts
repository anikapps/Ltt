import { NextRequest, NextResponse } from 'next/server';
import { getInvitePublicInfo, getRunningActiveTrip, smartVerifyLocalTourist } from '@/lib/repository';
import {
  TOURIST_COOKIE_NAME,
  REMEMBER_ME_COOKIE_NAME,
  signPayload,
  getTouristSessionFromCookies,
  getRememberedDeviceFromCookies
} from '@/lib/session';
import { checkRateLimit } from '@/lib/rate-limit';
import { isSupabaseConfigured, getSupabaseAdminClient } from '@/lib/supabase';
import { pgSmartVerifyTourist, pgAppendAuditLog } from '@/lib/db-normalized';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  const remembered = await getRememberedDeviceFromCookies();

  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdminClient()!;
    if (token) {
      const { data: inv } = await sb
        .from('trip_invitations')
        .select('*')
        .or(`token.eq.${token},invitation_code.eq.${token.toUpperCase()}`)
        .maybeSingle();

      if (!inv || inv.is_revoked || new Date(inv.expires_at).getTime() < Date.now()) {
        return NextResponse.json(
          { error: 'Invitation link is invalid, revoked, or expired.', remembered },
          { status: 404 }
        );
      }

      const { data: trip } = await sb
        .from('trips')
        .select('id, name, destination, start_date, end_date, status, require_passport')
        .eq('id', inv.trip_id)
        .maybeSingle();

      if (!trip || ['completed', 'cancelled', 'archived'].includes(trip.status)) {
        return NextResponse.json({ error: 'This trip is no longer active.', remembered }, { status: 404 });
      }

      return NextResponse.json({ valid: true, trip, remembered });
    }

    // Automatically select the running active tour when opening Join a Trip
    const { data: activeTrip } = await sb
      .from('trips')
      .select('id, name, destination, start_date, end_date, status')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ valid: true, smartJoin: true, activeTrip: activeTrip || null, remembered });
  }

  if (!token) {
    const activeTrip = await getRunningActiveTrip();
    return NextResponse.json({ valid: true, smartJoin: true, activeTrip, remembered });
  }

  const info = await getInvitePublicInfo(token);
  if (!info.valid) {
    return NextResponse.json({ error: info.reason || 'Invalid invitation link.', remembered }, { status: 404 });
  }
  return NextResponse.json({ ...info, remembered });
}

export async function DELETE() {
  const res = NextResponse.json({ cleared: true });
  res.cookies.delete(REMEMBER_ME_COOKIE_NAME);
  return res;
}

export async function POST(req: NextRequest) {
  const clientIp = req.headers.get('x-forwarded-for') || 'local';
  const rate = checkRateLimit(`verify:${clientIp}`, 15, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many verification attempts. Please wait a minute and try again.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const token = String(body.token || '').trim();
    const selectedTripId = String(body.selectedTripId || '').trim();
    const fullName = String(body.fullName || '').trim();
    const identifier = String(body.identifier || '').trim();
    const passportNumber = String(body.passportNumber || '').trim();
    const contactNumber = String(body.contactNumber || '').trim();
    const emergencyContact = String(body.emergencyContact || '').trim();
    const consentGranted = body.consentGranted === true;
    const rememberMe = body.rememberMe === true;
    const switchFromTrip = body.switchFromTrip === true;

    if (isSupabaseConfigured()) {
      if (switchFromTrip) {
        const currentSession = await getTouristSessionFromCookies();
        if (currentSession) {
          const sb = getSupabaseAdminClient()!;
          await sb
            .from('trip_members')
            .update({ session_revoked: true, sharing_enabled: false })
            .eq('id', currentSession.memberId);
          await pgAppendAuditLog({
            tripId: currentSession.tripId,
            actorLabel: `${currentSession.displayName} (${currentSession.touristCode})`,
            action: 'TRIP_SWITCHED',
            details: { fromTripId: currentSession.tripId, toInviteToken: token || 'smart-search' }
          });
        }
      }

      const result = await pgSmartVerifyTourist({
        inviteToken: token || undefined,
        fullName,
        identifier: identifier || contactNumber || passportNumber,
        passportNumber,
        contactNumber,
        emergencyContact,
        consentGranted,
        rememberMe
      });

      if (!result || !result.ok) {
        return NextResponse.json(result || { error: 'Verification failed.' }, { status: result?.status || 400 });
      }

      const signed = signPayload({
        sessionId: result.sessionId,
        tripId: result.tripId,
        memberId: result.member.id,
        touristCode: result.member.tourist_code,
        displayName: result.member.display_name,
        issuedAt: Date.now()
      });

      const res = NextResponse.json({
        verified: true,
        tripId: result.tripId,
        tripName: result.tripName,
        autoSwitched: Boolean((result as { autoSwitched?: boolean }).autoSwitched),
        member: result.member
      });

      res.cookies.set(TOURIST_COOKIE_NAME, signed, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 14
      });

      if (result.rememberInfo) {
        const remSigned = signPayload({
          displayName: result.member.display_name,
          maskedIdentifier: result.rememberInfo.maskedIdentifier,
          tripId: result.tripId,
          tripName: result.tripName,
          memberId: result.member.id,
          deviceTokenHash: result.rememberInfo.deviceTokenHash,
          savedAt: Date.now()
        });
        res.cookies.set(REMEMBER_ME_COOKIE_NAME, remSigned, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 60 * 60 * 24 * 30
        });
      }

      return res;
    }

    // Local JSON fallback with automatic trip matching & auto-switch
    const result = await smartVerifyLocalTourist({
      inviteToken: token || undefined,
      selectedTripId: selectedTripId || undefined,
      fullName,
      identifier: identifier || contactNumber || passportNumber,
      consentGranted
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: result.status });
    }

    const signed = signPayload({
      sessionId: result.sessionId,
      tripId: result.tripId,
      memberId: result.member.id,
      touristCode: result.member.tourist_code,
      displayName: result.member.display_name,
      issuedAt: Date.now()
    });

    const res = NextResponse.json({
      verified: true,
      tripId: result.tripId,
      tripName: result.tripName,
      autoSwitched: result.autoSwitched,
      member: result.member
    });
    res.cookies.set(TOURIST_COOKIE_NAME, signed, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 14
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unable to process registration request.' },
      { status: 500 }
    );
  }
}
