import { NextResponse } from 'next/server';
import { loadJar } from '@/lib/session';
import { page, StiNotFound, StiSessionExpired } from '@/lib/sti';
import { parseAnnouncements, parseAssignments, parseGrades } from '@/lib/parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The per-course route shape below is a best guess and is NOT confirmed against
 * a real account. If it 404s, read the dashboard route list and adjust.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid course id' }, { status: 400 });
  }

  const jar = await loadJar();
  if (!jar) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    const { html, status } = await page(jar, `/courses/${id}`);
    return NextResponse.json({
      id,
      status,
      assignments: parseAssignments(html),
      announcements: parseAnnouncements(html),
      grades: parseGrades(html),
    });
  } catch (err) {
    if (err instanceof StiSessionExpired) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof StiNotFound) {
      return NextResponse.json(
        {
          error: err.message,
          hint: 'This per-course route is unconfirmed. Read the route list on the dashboard and adjust.',
        },
        { status: 404 },
      );
    }
    console.error('[courses/:id] failed', err);
    return NextResponse.json({ error: 'Could not load that course.' }, { status: 502 });
  }
}