import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getInvitePublicInfo, verifyAndRegisterTourist } from '@/lib/repository';
import { signPayload, TOURIST_COOKIE_NAME, TouristSessionPayload } from '@/lib/session';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  if (!token) {
    return NextResponse.json({ valid: false, reason: 'Missing invitation token.' }, { status: 400 });
  }
  const info = await getInvitePublicInfo(token);
  return NextResponse.json(info, { status: info.valid ? 200 : 404 });
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'local-client';

  const rate = checkRateLimit(`verify:${ip}`, 15, 10 * 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Too many attempts. Please wait ${rate.retryAfterSeconds} seconds before trying again.`
      },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const inviteToken = String(body.inviteToken || '').trim();
    const fullName = String(body.fullName || '').trim();
    const preferredDisplayName = body.preferredDisplayName
      ? String(body.preferredDisplayName).trim()
      : undefined;
    const passportNumber = body.passportNumber ? String(body.passportNumber).trim() : undefined;
    const contactNumber = body.contactNumber ? String(body.contactNumber).trim() : undefined;
    const emergencyContact = body.emergencyContact
      ? String(body.emergencyContact).trim()
      : undefined;
    const consentGranted = body.consentGranted === true;
    const initialLat = typeof body.initialLat === 'number' ? body.initialLat : null;
    const initialLng = typeof body.initialLng === 'number' ? body.initialLng : null;
    const initialAcc = typeof body.initialAcc === 'number' ? body.initialAcc : null;

    const result = await verifyAndRegisterTourist({
      inviteToken,
      fullName,
      preferredDisplayName,
      passportNumber,
      contactNumber,
      emergencyContact,
      consentGranted,
      initialLat,
      initialLng,
      initialAcc
    });

    if (!result.ok || !result.sessionData) {
      return NextResponse.json(
        { error: result.error || 'Registration failed.' },
        { status: result.status || 401 }
      );
    }

    const sessionPayload: TouristSessionPayload = {
      memberId: result.sessionData.memberId,
      tripId: result.sessionData.tripId,
      rosterId: result.sessionData.rosterId,
      displayName: result.sessionData.displayName,
      sessionToken: result.sessionData.sessionToken,
      issuedAt: Date.now()
    };

    const signedCookie = signPayload(sessionPayload);
    const res = NextResponse.json({
      verified: true,
      tripId: result.sessionData.tripId,
      memberId: result.sessionData.memberId,
      displayName: result.sessionData.displayName
    });

    res.cookies.set(TOURIST_COOKIE_NAME, signedCookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 14
    });

    return res;
  } catch {
    return NextResponse.json(
      { error: 'Unable to process registration request.' },
      { status: 500 }
    );
  }
}
