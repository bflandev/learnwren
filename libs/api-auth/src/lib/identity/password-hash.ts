import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

const SCHEME = 'scrypt';
const COST = 32768; // N
const BLOCK_SIZE = 8; // r
const PARALLELISM = 1; // p
const SALT_BYTES = 16;
const KEY_BYTES = 64;
// N=32768, r=8 needs 128*N*r = 32 MiB, exactly Node's default maxmem; give headroom.
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;

// promisify runs scrypt inside a Promise executor, so a synchronous parameter error also rejects.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keyBytes: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/** scrypt$N$r$p$salt$key: parameters travel with the hash so they can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_BYTES, { N: COST, r: BLOCK_SIZE, p: PARALLELISM, maxmem: MAX_MEMORY_BYTES });
  return [SCHEME, COST, BLOCK_SIZE, PARALLELISM, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Constant-time check against a stored hash; false for a wrong password or a malformed hash. */
export async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== SCHEME) return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64!, 'base64');
  if (expected.length === 0) return false;
  try {
    const actual = await scryptAsync(
      password,
      Buffer.from(saltB64!, 'base64'),
      expected.length,
      { N: Number(n!), r: Number(r!), p: Number(p!), maxmem: MAX_MEMORY_BYTES },
    );
    return timingSafeEqual(actual, expected);
  } catch {
    // Invalid stored parameters (e.g. N not a power of two): treat as a non-match.
    return false;
  }
}

let dummy: Promise<string> | undefined;

/** A hash of a random secret, so an unknown email costs the same scrypt work as a known one. */
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(32).toString('base64'));
  return dummy;
}
