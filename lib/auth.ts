import { cookies } from 'next/headers';
import { derive, safeEqual } from './crypto';

const KEY = 'sti_gate';

/** When APP_PASSWORD is unset the app is open, which is fine for local dev only. */
export function gateEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

export async function isUnlocked(): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true;
  const token = (await cookies()).get(KEY)?.value;
  if (!token) return false;
  return safeEqual(token, derive(expected));
}

export async function unlock(password: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true;
  const digest = derive(expected);
  if (!safeEqual(derive(password), digest)) return false;

  (await cookies()).set(KEY, digest, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return true;
}