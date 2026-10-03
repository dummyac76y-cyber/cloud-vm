import * as cheerio from 'cheerio';
import { PATHS } from './paths';

export { cheerio };

export const ORIGIN = 'https://elms.sti.edu';

export type Cookie = { name: string; value: string };

export class StiSessionExpired extends Error {
  constructor() {
    super('Your eLMS session expired. Reconnect to continue.');
    this.name = 'StiSessionExpired';
  }
}

export class StiAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StiAuthError';
  }
}

/** The route does not exist on this deployment; usually an unconfirmed path. */
export class StiNotFound extends Error {
  constructor(path: string) {
    super(`eLMS returned HTTP 404 for ${path}.`);
    this.name = 'StiNotFound';
  }
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const cookieHeader = (jar: Cookie[]): string =>
  jar.map((c) => `${c.name}=${c.value}`).join('; ');

/**
 * Folds Set-Cookie headers back into the jar. Rails rotates the session id
 * after login and periodically afterwards, so this must run on every request.
 */
function absorb(jar: Cookie[], res: Response): Cookie[] {
  const raw = res.headers.getSetCookie?.() ?? [];
  if (raw.length === 0) return jar;

  const next = new Map(jar.map((c) => [c.name, c]));
  for (const line of raw) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const maxAge = /max-age=(-?\d+)/i.exec(line);
    const expires = /expires=([^;]+)/i.exec(line);
    const dead = maxAge ? Number(maxAge[1]) <= 0 : expires ? Date.parse(expires[1]) <= Date.now() : false;
    if (dead) next.delete(name);
    else next.set(name, { name, value });
  }
  return [...next.values()];
}

/** Extracts the Rails CSRF token from a page's markup. */
export function csrfToken(html: string): string {
  return (
    /name="authenticity_token"\s+value="([^"]+)"/.exec(html)?.[1] ??
    /name="csrf-token"\s+content="([^"]+)"/.exec(html)?.[1] ??
    ''
  );
}

/**
 * Rejects anything that could escape the STI origin. `//evil.example` and
 * `/\evil.example` are both protocol-relative, and a bare `evil.example` would
 * be resolved against ORIGIN as a relative path anyway, so require a leading
 * slash that is not followed by a separator.
 */
export function assertSafePath(path: string): void {
  if (!/^\/([^\/\\].*)?$/.test(path)) {
    throw new StiAuthError('path must be an absolute path like /courses');
  }
}

/**
 * Detects that a response came from a signed-out visitor.
 *
 * The eLMS landing page `/` is public, so probing it proves nothing. The
 * dashboard at /home is the guard: anonymous visitors are bounced to
 * /site/not_logged_in?from=%2Fhome&log_in_required=true.
 */
export function isLoggedOut(url: string, status: number): boolean {
  if (status === 401 || status === 403) return true;
  return (
    url.includes('/log_in') ||
    url.includes('/site/not_logged_in') ||
    /[?&]log_in_required=true/.test(url)
  );
}

export type Raw = { html: string; jar: Cookie[]; url: string; status: number };

/** Performs a GET and returns the body plus the rotated cookie jar. */
export async function raw(jar: Cookie[], path: string, init: RequestInit = {}): Promise<Raw> {
  assertSafePath(path);
  const res = await fetch(new URL(path, ORIGIN), {
    ...init,
    headers: {
      'user-agent': USER_AGENT,
      'accept-language': 'en-PH,en;q=0.9',
      accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      cookie: cookieHeader(jar),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  return { html: await res.text(), jar: absorb(jar, res), url: res.url, status: res.status };
}

/** Same as {@link raw}, but throws when the route is missing or the session is gone. */
export async function page(jar: Cookie[], path: string): Promise<Raw> {
  const result = await raw(jar, path);
  if (isLoggedOut(result.url, result.status)) {
    throw new StiSessionExpired();
  }
  if (result.status === 404) {
    throw new StiNotFound(path);
  }
  return result;
}

/**
 * Fetches the signed-in dashboard and throws if the session is not actually
 * authenticated. Use this to validate a jar before storing it.
 */
export async function verifySession(jar: Cookie[]): Promise<Raw> {
  const result = await raw(jar, PATHS.dashboard);

  if (isLoggedOut(result.url, result.status)) {
    throw new StiSessionExpired();
  }
  if (result.status === 429) {
    throw new StiAuthError('The eLMS is rate limiting this IP. Wait a few minutes, then reconnect.');
  }
  if (result.status >= 400) {
    throw new StiAuthError(
      `The eLMS returned HTTP ${result.status} for ${PATHS.dashboard}. Check STI_DASHBOARD_PATH.`,
    );
  }
  return result;
}

/**
 * Signs in through the credential form. Note that the eLMS hides this form
 * behind an "Admin log in" toggle, so most student accounts are rejected here
 * and must use Microsoft Entra ID instead (see connectWithCookies).
 */
export async function loginWithPassword(userid: string, password: string): Promise<Cookie[]> {
  const form = await raw([], '/log_in/form');
  if (form.url.includes('/log_in') === false && form.status !== 200) {
    throw new StiAuthError(`Could not load the login form (HTTP ${form.status}).`);
  }

  const body = new URLSearchParams({
    utf8: '\u2713',
    authenticity_token: csrfToken(form.html),
    form_login: 'true',
    userid,
    password,
    remember_me: '1',
  });

  const res = await fetch(`${ORIGIN}/log_in/submit_from_portal`, {
    method: 'POST',
    headers: {
      'user-agent': USER_AGENT,
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      accept: '*/*',
      referer: `${ORIGIN}/log_in/form`,
      cookie: cookieHeader(form.jar),
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) throw new StiAuthError(`Login failed (HTTP ${res.status}).`);

  const rejected =
    /"success"\s*:\s*false/i.test(text) ||
    /invalid|incorrect|unauthoriz|not\s*found|does\s*not\s*exist/i.test(text);
  if (rejected) {
    throw new StiAuthError(
      'Rejected by eLMS. Student accounts must sign in with Microsoft Entra ID — use the paste-cookies option.',
    );
  }

  const probe = await raw(absorb(form.jar, res), PATHS.dashboard);
  if (isLoggedOut(probe.url, probe.status)) {
    throw new StiAuthError('Login did not create a session. Try the paste-cookies option.');
  }
  return probe.jar;
}

/**
 * Accepts either a `document.cookie` string or the JSON array that DevTools
 * exports, so you can copy a session out of a real browser after SSO.
 */
export function parseCookieInput(input: string): Cookie[] {
  const text = input.trim();
  if (!text) throw new StiAuthError('Paste at least one cookie.');

  if (text.startsWith('[')) {
    const parsed = JSON.parse(text) as { name: string; value: string }[];
    const jar = parsed
      .filter((c) => typeof c?.name === 'string' && typeof c?.value === 'string')
      .map((c) => ({ name: c.name, value: c.value }));
    if (jar.length === 0) throw new StiAuthError('That JSON array contained no cookies.');
    return jar;
  }

  const jar = text
    .split(/;\s*/)
    .filter((pair) => pair.includes('='))
    .map((pair) => ({
      name: pair.slice(0, pair.indexOf('=')).trim(),
      value: pair.slice(pair.indexOf('=') + 1).trim(),
    }))
    .filter((c) => c.name.length > 0);

  if (jar.length === 0) throw new StiAuthError('No cookies found. Copy them from DevTools.');
  return jar;
}