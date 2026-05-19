import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';

/**
 * Public key band:
 *   sz_live_  — production-band key. Counts toward billing/quota.
 *   sz_test_  — non-production-band key. Same auth flow today; reserved so we can
 *               route test traffic to a separate metering bucket later without a
 *               schema change.
 */
export const API_KEY_BANDS = ['live', 'test'] as const;
export type ApiKeyBand = (typeof API_KEY_BANDS)[number];

const BAND_PREFIX = 'sz_';
/** Cleartext prefix we store + show in the UI. Long enough for unique lookup. */
const PREFIX_LENGTH = 16; // e.g. "sz_live_a1b2c3d4"

// 32 random bytes → 44 base64 chars; restrict to URL-safe alphabet.
const SECRET_BYTES = 32;
const BCRYPT_ROUNDS = 12;

function urlSafeRandom(byteCount: number): string {
  return randomBytes(byteCount)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function generateApiKey(band: ApiKeyBand): {
  fullKey: string;
  prefix: string;
} {
  const secret = urlSafeRandom(SECRET_BYTES);
  const fullKey = `${BAND_PREFIX}${band}_${secret}`;
  const prefix = fullKey.slice(0, PREFIX_LENGTH);
  return { fullKey, prefix };
}

export async function hashApiKey(fullKey: string): Promise<string> {
  return bcrypt.hash(fullKey, BCRYPT_ROUNDS);
}

export async function verifyApiKey(fullKey: string, hash: string): Promise<boolean> {
  return bcrypt.compare(fullKey, hash);
}

/**
 * Pull the band+prefix out of a candidate key. Returns null if the string doesn't
 * match the expected shape. Used by the guard before going to the DB so malformed
 * tokens are rejected without a query.
 */
export function parseApiKey(candidate: string): { band: ApiKeyBand; prefix: string } | null {
  if (!candidate.startsWith(BAND_PREFIX)) return null;
  const afterBrand = candidate.slice(BAND_PREFIX.length);
  const underscore = afterBrand.indexOf('_');
  if (underscore <= 0) return null;
  const band = afterBrand.slice(0, underscore) as ApiKeyBand;
  if (!API_KEY_BANDS.includes(band)) return null;
  if (candidate.length < PREFIX_LENGTH + 8) return null;
  return { band, prefix: candidate.slice(0, PREFIX_LENGTH) };
}
