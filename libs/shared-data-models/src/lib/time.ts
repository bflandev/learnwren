import type { ISODateString } from './common';

/**
 * The current wall-clock instant as a branded ISO 8601 string
 * (e.g. "2026-04-29T13:00:00.000Z"). The single source of truth for
 * on-the-wire timestamps; previously copy-pasted across the api libs.
 */
export function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}
