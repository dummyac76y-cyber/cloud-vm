import { NextResponse } from 'next/server';
import { clearJar, loadJar, saveJar } from '@/lib/session';
import {
  StiAuthError,
  StiSessionExpired,
  loginWithPassword,
  parseCookieInput,
  verifySession,
} from '@/lib/sti';
import { clientKey, rateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ authenticated: (await loadJar()) !== null });
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'session'), 10, 10 * 60 * 1000)) {
    return NextResponse.json(
      { ok: false, error: 'Too many attempts. Wait a few minutes and try again.' },
      { status: 429 },
    );
  }

  let mode: unknown;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    mode = body.mode;

    const jar =
      mode === 'cookies'
        ? parseCookieInput(typeof body.cookies === 'string' ? body.cookies : '')
        : await loginWithPassword(
            typeof body.userid === 'string' ? body.userid : '',
            typeof body.password === 'string' ? body.password : '',
          );

    // Never persist a jar that is not genuinely authenticated. The landing
    // page is public, so this checks the login-gated dashboard instead.
    const probe = await verifySession(jar);
    await saveJar(probe.jar);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof StiSessionExpired) {
      return NextResponse.json(
        {
          ok: false,
          error:
            mode === 'cookies'
              ? 'Those cookies are not signed in. Copy them again after logging in at elms.sti.edu.'
              : 'Login did not create a usable session.',
        },
        { status: 400 },
      );
    }
    if (err instanceof StiAuthError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error('[session] unexpected error', err);
    return NextResponse.json({ ok: false, error: 'Unexpected error.' }, { status: 500 });
  }
}

export async function DELETE() {
  await clearJar();
  return NextResponse.json({ ok: true });
}