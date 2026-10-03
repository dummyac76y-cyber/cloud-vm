import crypto from 'node:crypto';

const key = (): Buffer => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is not set. See .env.example.');
  }
  return crypto.createHash('sha256').update(secret).digest();
};

/** Encrypts a JSON-serialisable value into a single cookie-safe token. */
export function seal<T>(value: T): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

/** Decrypts a token produced by {@link seal}. Returns null when invalid or tampered with. */
export function unseal<T>(token: string): T | null {
  try {
    const [iv, tag, data] = token.split('.').map((s) => Buffer.from(s, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Deterministic keyed digest. Unlike {@link seal} this is stable for the same
 * input, which is what makes constant-time comparison of secrets possible.
 */
export function derive(value: string): string {
  return crypto.createHmac('sha256', key()).update(value).digest('base64url');
}

/** Constant-time string comparison that tolerates length mismatches. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}