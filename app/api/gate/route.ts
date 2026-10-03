import { NextResponse } from 'next/server';
import { unlock } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') ?? '';
  const password = contentType.includes('application/json')
    ? ((await req.json()) as { password?: string }).password ?? ''
    : new URLSearchParams(await req.text()).get('password') ?? '';

  if (!(await unlock(password))) {
    if (contentType.includes('application/json')) {
      return NextResponse.json({ ok: false, error: 'Wrong password.' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/', req.url), { status: 303 });
  }

  if (contentType.includes('application/json')) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.redirect(new URL('/', req.url), { status: 303 });
}