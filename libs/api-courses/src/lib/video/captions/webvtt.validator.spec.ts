import { describe, expect, it } from 'vitest';

import { isValidWebVtt } from './webvtt.validator';

const VALID = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world
`;

describe('isValidWebVtt', () => {
  it('accepts a well-formed cue file', () => {
    expect(isValidWebVtt(VALID)).toBe(true);
  });
  it('accepts a leading UTF-8 BOM', () => {
    expect(isValidWebVtt(String.fromCharCode(0xfeff) + VALID)).toBe(true);
  });
  it('accepts hour-less cue timings', () => {
    expect(isValidWebVtt('WEBVTT\n\n00:01.000 --> 00:04.000\nHi\n')).toBe(true);
  });
  it('rejects a file without the WEBVTT signature', () => {
    expect(isValidWebVtt('00:00:01.000 --> 00:00:04.000\nHi')).toBe(false);
  });
  it('rejects a signature-only file with no cue', () => {
    expect(isValidWebVtt('WEBVTT\n\n')).toBe(false);
  });
  it('rejects a file where WEBVTT is not at the very start', () => {
    expect(isValidWebVtt('  WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHi')).toBe(false);
  });

  // ---- signature separator (kills the `[ \t\r\n]|$` mutants) ----
  it('rejects WEBVTT immediately followed by a non-separator character', () => {
    // "WEBVTTX..." has no space/tab/newline/EOF after the magic — must be rejected.
    expect(isValidWebVtt('WEBVTTX\n\n00:00:01.000 --> 00:00:04.000\nHi')).toBe(false);
  });
  it('accepts WEBVTT followed by a tab separator', () => {
    expect(isValidWebVtt('WEBVTT\t\n\n00:00:01.000 --> 00:00:04.000\nHi')).toBe(true);
  });

  // ---- cue timing regex (kills the CUE_TIMING mutants) ----
  it('accepts a cue with no whitespace around the arrow', () => {
    expect(isValidWebVtt('WEBVTT\n\n00:00:01.000-->00:00:04.000\nHi')).toBe(true);
  });
  it('rejects a cue using a single-dash arrow', () => {
    expect(isValidWebVtt('WEBVTT\n\n00:00:01.000 -> 00:00:04.000\nHi')).toBe(false);
  });
  it('rejects a cue missing the milliseconds component', () => {
    expect(isValidWebVtt('WEBVTT\n\n00:00:01 --> 00:00:04\nHi')).toBe(false);
  });
  it('rejects a cue with single-digit minute/second fields', () => {
    expect(isValidWebVtt('WEBVTT\n\n0:0.0 --> 0:4.0\nHi')).toBe(false);
  });
  it('rejects a cue whose timing uses non-digits', () => {
    expect(isValidWebVtt('WEBVTT\n\naa:bb:cc.ddd --> aa:bb:cc.ddd\nHi')).toBe(false);
  });
  it('rejects a cue whose first field is a single digit (kills the MM `\\d{2}`->`\\d` mutant)', () => {
    // "0:01.000" must NOT validate: the leading minutes field requires two digits.
    expect(isValidWebVtt('WEBVTT\n\n0:01.000 --> 00:04.000\nHi')).toBe(false);
  });
  it('rejects a cue whose trailing milliseconds are a single digit (kills the final `\\d{3}`->`\\d` mutant)', () => {
    // The end timestamp ".0" (one ms digit) must be rejected; ".000" is required.
    expect(isValidWebVtt('WEBVTT\n\n00:00:01.000 --> 00:00:04.0\nHi')).toBe(false);
  });
});
