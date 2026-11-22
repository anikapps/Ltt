import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromCookies } from '@/lib/session';
import { parseAndValidateRosterBuffer } from '@/lib/roster-parser';
import { getAdminTripDetail, saveImportedRoster } from '@/lib/repository';

export async function POST(
  req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const admin = getAdminSessionFromCookies();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized administrator access.' }, { status: 401 });
  }

  try {
    const tripDetail = await getAdminTripDetail(params.tripId, admin.email);
    if (!tripDetail) {
      return NextResponse.json({ error: 'Trip not found.' }, { status: 404 });
    }

    if (tripDetail.trip.status === 'completed') {
      return NextResponse.json(
        { error: 'Cannot upload a passenger roster to a completed trip.' },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'Please select a valid .xlsx or .csv roster file.' },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.csv') && !fileName.endsWith('.xls')) {
      return NextResponse.json(
        { error: 'Unsupported file format. Please upload an Excel (.xlsx) or CSV (.csv) file.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parseResult = parseAndValidateRosterBuffer(
      buffer,
      params.tripId,
      tripDetail.trip.max_tourists
    );

    if (!parseResult.valid) {
      return NextResponse.json(
        {
          valid: false,
          errors: parseResult.errors,
          totalRowsRead: parseResult.totalRowsRead
        },
        { status: 422 }
      );
    }

    const saved = await saveImportedRoster(params.tripId, parseResult.entries, admin.email);

    return NextResponse.json({
      valid: true,
      importedCount: saved.importedCount,
      errors: []
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to import passenger roster.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
