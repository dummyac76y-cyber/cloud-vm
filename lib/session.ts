import { cookies } from 'next/headers';
import { seal, unseal } from './crypto';
import type { Cookie } from './sti';

const KEY = 'sti_jar';
const MAX_AGE = 60 * 60 * 8;
const COOKIE_BUDGET = 3800;

function assertFits(token: string): void {
  if (token.length <= COOKIE_BUDGET) return;
  console.warn(
    `[session] sealed jar is ${token.length} bytes, over the ~${COOKIE_BUDGET} cookie budget. ` +
      'Prune the jar in lib/sti.ts or move storage to Vercel KV.',
  );
  throw new Error('Session payload is too large for a cookie. Prune it or use external storage.');
}

export async function saveJar(jar: Cookie[]): Promise<void> {
  const token = seal(jar);
  assertFits(token);
  (await cookies()).set(KEY, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function loadJar(): Promise<Cookie[] | null> {
  const token = (await cookies()).get(KEY)?.value;
  if (!token) return null;
  const jar = unseal<Cookie[]>(token);
  if (!Array.isArray(jar) || jar.length === 0) return null;
  return jar;
}

export async function clearJar(): Promise<void> {
  (await cookies()).delete(KEY);
}