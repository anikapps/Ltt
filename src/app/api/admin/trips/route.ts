import { MAX_PASSENGERS_PER_TRIP } from '@/lib/capacity';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromCookies } from '@/lib/session';
import { getAdminDashboardSummary, createNewTrip } from '@/lib/repository';

export async function GET() {
  const admin = getAdminSessionFromCookies();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized administrator access.' }, { status: 401 });
  }

  const summary = await getAdminDashboardSummary(admin.email);
  return NextResponse.json(summary);
}

export async function POST(req: NextRequest) {
  const admin = getAdminSessionFromCookies();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized administrator access.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, destination, start_date, end_date, max_tourists } = body;

    if (!name || !destination || !start_date || !end_date) {
      return NextResponse.json(
        { error: 'Trip Name, Destination, Start Date, and End Date are required.' },
        { status: 400 }
      );
    }

    const parsedMax = Number(max_tourists ?? MAX_PASSENGERS_PER_TRIP);
    if (!Number.isInteger(parsedMax) || parsedMax < 1 || parsedMax > MAX_PASSENGERS_PER_TRIP) {
      return NextResponse.json(
        { error: `Passenger capacity must be between 1 and ${MAX_PASSENGERS_PER_TRIP} passengers.` },
        { status: 400 }
      );
    }

    const created = await createNewTrip({
      name: String(name),
      destination: String(destination),
      start_date: String(start_date),
      end_date: String(end_date),
      max_tourists: parsedMax,
      adminEmail: admin.email,
      adminName: admin.name
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create trip.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
