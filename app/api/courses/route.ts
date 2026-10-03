import { NextResponse } from 'next/server';
import { loadJar } from '@/lib/session';
import { page, StiNotFound, StiSessionExpired } from '@/lib/sti';
import { PATHS } from '@/lib/paths';
import { parseCourses } from '@/lib/parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const jar = await loadJar();
  if (!jar) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    const { html } = await page(jar, PATHS.courses);
    return NextResponse.json({ path: PATHS.courses, courses: parseCourses(html) });
  } catch (err) {
    if (err instanceof StiSessionExpired) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof StiNotFound) {
      return NextResponse.json(
        { error: err.message, hint: 'Set STI_COURSES_PATH to the route listed on the dashboard.' },
        { status: 404 },
      );
    }
    console.error('[courses] failed', err);
    return NextResponse.json({ error: 'Could not load courses.' }, { status: 502 });
  }
}