import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromCookies } from '@/lib/session';
import { parseRosterBuffer } from '@/lib/roster-parser';
import { saveImportedRoster } from '@/lib/repository';
import { isSupabaseConfigured } from '@/lib/supabase';
import { pgSaveImportedRoster } from '@/lib/db-normalized';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ tripId: string }> }
) {
  const session = await getAdminSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized administrator session.' }, { status: 401 });
  }
  if (session.role === 'responder') {
    return NextResponse.json({ error: 'Responders cannot modify passenger rosters.' }, { status: 403 });
  }

  try {
    const { tripId } = await context.params;
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Please upload a valid .xlsx or .csv roster file.' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Roster file must be smaller than 5 MB.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parsedResult = await parseRosterBuffer(buffer, file.name);
    const parsedEntries = parsedResult.entries;

    if (parsedEntries.length === 0) {
      return NextResponse.json(
        {
          error: parsedResult.errors[0] || 'No valid passenger rows found in uploaded file.',
          validationErrors: parsedResult.errors
        },
        { status: 400 }
      );
    }

    const parsed = isSupabaseConfigured()
      ? await pgSaveImportedRoster({ tripId, entries: parsedEntries, actorEmail: session.email })
      : await saveImportedRoster(tripId, parsedEntries, session.email);

    const importedCount =
      parsed && typeof parsed === 'object' && 'importedCount' in parsed
        ? parsed.importedCount
        : parsedEntries.length;

    return NextResponse.json({
      importedCount,
      totalRows: parsedResult.totalRows,
      validationErrors: parsedResult.errors
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to parse uploaded roster.' },
      { status: 500 }
    );
  }
}
