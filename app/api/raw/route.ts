import { NextResponse } from 'next/server';
import { loadJar } from '@/lib/session';
import { raw, assertSafePath, StiAuthError } from '@/lib/sti';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ESCAPES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;' };
const escapeHtml = (s: string) => s.replace(/[<>&]/g, (c) => ESCAPES[c]);

/**
 * Renders any authenticated eLMS page as escaped source.
 *
 * STI has no public API and the HTML is server-rendered, so inspecting the real
 * markup here is how you work out what the selectors in lib/parse.ts should be.
 */
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get('path') ?? '/courses';

  const jar = await loadJar();
  if (!jar) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    assertSafePath(path);
    const { html, url, status } = await raw(jar, path);
    // Always answer 200 so a redirect or 401 can still be read in the browser.
    const head = `<!-- STI ${escapeHtml(path)} -> ${status} ${escapeHtml(url)} -->\n`;
    const body = `<base href="${escapeHtml(url)}"><pre style="white-space:pre-wrap;font-size:12px">${head}${escapeHtml(html)}</pre>`;
    return new NextResponse(body, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch (err) {
    if (err instanceof StiAuthError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('[raw] failed', err);
    return NextResponse.json({ error: 'Could not fetch that page.' }, { status: 502 });
  }
}