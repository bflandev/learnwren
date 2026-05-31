// A cue timing line: HH:MM:SS.mmm --> HH:MM:SS.mmm with hours optional.
const CUE_TIMING = /(?:\d{2}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(?:\d{2}:)?\d{2}:\d{2}\.\d{3}/;

/**
 * Minimal WebVTT structural check (no full parse): the body must begin with the
 * `WEBVTT` magic (BOM-tolerant, optionally followed by space/tab/newline or EOF)
 * and contain at least one cue timing line.
 */
export function isValidWebVtt(text: string): boolean {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (!/^WEBVTT(?:[ \t\r\n]|$)/.test(body)) return false;
  return CUE_TIMING.test(body);
}
