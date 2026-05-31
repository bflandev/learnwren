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
});
