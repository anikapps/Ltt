import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromCookies } from '@/lib/session';
import { getAdminDashboardSummary, createNewTrip } from '@/lib/repository';
import { isSupabaseConfigured } from '@/lib/supabase';
import { pgGetAdminDashboardSummary, pgCreateNewTrip } from '@/lib/db-normalized';
import { MAX_PASSENGERS_PER_TRIP } from '@/lib/capacity';

export async function GET() {
  const session = await getAdminSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized administrator session.' }, { status: 401 });
  }
  if (isSupabaseConfigured()) {
    const summary = await pgGetAdminDashboardSummary(session.email, session.role);
    return NextResponse.json(summary);
  }
  const summary = await getAdminDashboardSummary(session.email);
  return NextResponse.json(summary);
}

export async function POST(req: NextRequest) {
  const session = await getAdminSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized administrator session.' }, { status: 401 });
  }
  if (session.role === 'responder') {
    return NextResponse.json({ error: 'Responders cannot create new trips.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const destination = String(body.destination || '').trim();
    const start_date = String(body.start_date || '').trim();
    const end_date = String(body.end_date || '').trim();
    const parsedMax = Number(body.max_tourists || MAX_PASSENGERS_PER_TRIP);
    if (!Number.isFinite(parsedMax) || parsedMax < 1 || parsedMax > MAX_PASSENGERS_PER_TRIP) {
      return NextResponse.json(
        { error: `Maximum tourists per trip must be between 1 and ${MAX_PASSENGERS_PER_TRIP}.` },
        { status: 400 }
      );
    }

    if (!name || !destination || !start_date || !end_date) {
      return NextResponse.json(
        { error: 'Please provide trip name, destination, start date, and end date.' },
        { status: 400 }
      );
    }

    if (isSupabaseConfigured()) {
      const result = await pgCreateNewTrip({
        name,
        destination,
        start_date,
        end_date,
        max_tourists: parsedMax,
        organizer_contact: String(body.organizer_contact || ''),
        require_passport: Boolean(body.require_passport),
        adminEmail: session.email,
        adminName: session.name
      });
      return NextResponse.json(result, { status: 201 });
    }

    const result = await createNewTrip({
      name,
      destination,
      start_date,
      end_date,
      max_tourists: parsedMax,
      organizer_contact: String(body.organizer_contact || ''),
      require_passport: Boolean(body.require_passport),
      adminEmail: session.email,
      adminName: session.name
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create trip.' },
      { status: 500 }
    );
  }
}
