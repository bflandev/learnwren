import { randomInt } from 'node:crypto';

export const AUTO_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const AUTO_ID_LENGTH = 20;

/** A Firestore-shaped auto-id, so ids look the same in both backends (spec §3.3). */
export function autoId(): string {
  let id = '';
  for (let i = 0; i < AUTO_ID_LENGTH; i++) id += AUTO_ID_ALPHABET[randomInt(AUTO_ID_ALPHABET.length)];
  return id;
}
