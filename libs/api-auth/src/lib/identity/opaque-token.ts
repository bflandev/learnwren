import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** A bearer secret for sessions and email links. Store only sha256Hex(token). */
export function newOpaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
