import { describe, expect, it } from 'vitest';
import { Duration } from 'luxon';
import {
  DURATION_MAX_MILLIS,
  MINUTE_PRECISION,
  clampDuration,
  durationToParts,
  formatDuration,
  maskForDuration,
  parseDuration,
  partsToDuration,
  placeholderForDuration,
  serializeDuration,
  type DurationPrecision,
} from './duration-picker-core';

const SECONDS: DurationPrecision = { seconds: true, milliseconds: false };
const MILLIS: DurationPrecision = { seconds: true, milliseconds: true };
// ms-without-seconds is normalized to seconds-on by the format/mask helpers.
const MS_ONLY: DurationPrecision = { seconds: false, milliseconds: true };

describe('maskForDuration', () => {
  it('grows the template with precision and the days segment', () => {
    expect(maskForDuration(false, MINUTE_PRECISION)).toBe('99:99');
    expect(maskForDuration(false, SECONDS)).toBe('99:99:99');
    expect(maskForDuration(false, MILLIS)).toBe('99:99:99.999');
    expect(maskForDuration(false, MS_ONLY)).toBe('99:99:99.999');
    expect(maskForDuration(true, MINUTE_PRECISION)).toBe('999 99:99');
    expect(maskForDuration(true, MILLIS)).toBe('999 99:99:99.999');
  });
});

describe('placeholderForDuration', () => {
  it('mirrors the mask shape as a human hint', () => {
    expect(placeholderForDuration(false, MINUTE_PRECISION)).toBe('hh:mm');
    expect(placeholderForDuration(false, SECONDS)).toBe('hh:mm:ss');
    expect(placeholderForDuration(false, MILLIS)).toBe('hh:mm:ss.sss');
    expect(placeholderForDuration(true, MINUTE_PRECISION)).toBe('ddd hh:mm');
  });
});

describe('formatDuration', () => {
  it('zero-pads hours-led at minute precision', () => {
    expect(
      formatDuration(Duration.fromObject({ hours: 2, minutes: 30 }), false),
    ).toBe('02:30');
  });
  it('trails seconds and milliseconds per precision', () => {
    const d = Duration.fromObject({
      hours: 2,
      minutes: 30,
      seconds: 15,
      milliseconds: 250,
    });
    expect(formatDuration(d, false, SECONDS)).toBe('02:30:15');
    expect(formatDuration(d, false, MILLIS)).toBe('02:30:15.250');
  });
  it('prefixes a zero-padded days segment when showDays is on', () => {
    const d = Duration.fromObject({ days: 2, hours: 3, minutes: 5 });
    expect(formatDuration(d, true)).toBe('002 03:05');
  });
  it('normalizes overflow into the hours-led shape (no days)', () => {
    // 150 minutes → 2h 30m; 50 hours stays in the hours slot (>24h, no days).
    expect(formatDuration(Duration.fromObject({ minutes: 150 }), false)).toBe(
      '02:30',
    );
    expect(
      formatDuration(Duration.fromObject({ hours: 50, minutes: 5 }), false),
    ).toBe('50:05');
  });
  it('returns empty string for null / invalid', () => {
    expect(formatDuration(null, false)).toBe('');
    expect(formatDuration(Duration.invalid('bad'), false)).toBe('');
  });
});

describe('parseDuration', () => {
  it('parses a complete masked entry to the right total', () => {
    expect(parseDuration('0230', false)?.toMillis()).toBe(
      Duration.fromObject({ hours: 2, minutes: 30 }).toMillis(),
    );
    expect(parseDuration('01:02:03', false, SECONDS)?.toMillis()).toBe(
      Duration.fromObject({ hours: 1, minutes: 2, seconds: 3 }).toMillis(),
    );
    expect(parseDuration('00:00:01.250', false, MILLIS)?.toMillis()).toBe(
      Duration.fromObject({ seconds: 1, milliseconds: 250 }).toMillis(),
    );
  });
  it('reads the days segment when showDays is on', () => {
    expect(parseDuration('002 03:04', true)?.toMillis()).toBe(
      Duration.fromObject({ days: 2, hours: 3, minutes: 4 }).toMillis(),
    );
  });
  it('returns null for incomplete or empty entry', () => {
    expect(parseDuration('2:3', false)).toBeNull();
    expect(parseDuration('', false)).toBeNull();
    expect(parseDuration('   ', false)).toBeNull();
  });

  it('returns null for an entry that masks to fewer characters than the template', () => {
    // '02:3' normalizes to a 4-char partial against the 5-char '99:99' mask —
    // without the completeness check it would parse as a valid 02:03.
    expect(parseDuration('02:3', false)).toBeNull();
    expect(parseDuration('023', false)).toBeNull();
  });

  it('returns null when a string is full-length but has missing numeric segments', () => {
    // The defensive check on lines 104-109 guards against a scenario where the
    // normalized string has the right length but the regex extracts fewer numeric
    // segments than expected, leaving some variables as undefined. This happens
    // when the input contains non-digit placeholders (like underscores from
    // applyMaskWithSkeleton or other non-digit chars) in digit positions.
    // For mask '99:99' (5 chars): '__:99' has the right length but only one
    // digit run, so hours = nums[0] = undefined, minutes = nums[1] = 99.
    // The check catches hours being undefined and returns null.
    expect(parseDuration('__:99', false)).toBeNull();
    expect(parseDuration('99:__', false)).toBeNull();
    expect(parseDuration('___ 12:34', true)).toBeNull();
  });
});

describe('durationToParts / partsToDuration', () => {
  it('splits a days-led duration into floored component parts', () => {
    expect(
      durationToParts(
        Duration.fromObject({ days: 2, hours: 3, minutes: 5, seconds: 9 }),
        true,
      ),
    ).toEqual({ days: 2, hours: 3, minutes: 5, seconds: 9, milliseconds: 0 });
  });
  it('folds days into hours when showDays is off', () => {
    // 1 day 2h → 26h in the hours slot, no days.
    expect(
      durationToParts(Duration.fromObject({ days: 1, hours: 2 }), false),
    ).toEqual({ days: 0, hours: 26, minutes: 0, seconds: 0, milliseconds: 0 });
  });
  it('returns all zeros for null / invalid', () => {
    const zero = { days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: 0 };
    expect(durationToParts(null, true)).toEqual(zero);
    expect(durationToParts(Duration.invalid('bad'), true)).toEqual(zero);
  });
  it('carries the milliseconds component through to the parts', () => {
    expect(
      durationToParts(Duration.fromObject({ milliseconds: 250 }), false),
    ).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: 250 });
  });
  it('round-trips parts back into the same total', () => {
    const parts = {
      days: 1,
      hours: 2,
      minutes: 3,
      seconds: 4,
      milliseconds: 5,
    };
    expect(partsToDuration(parts)?.toMillis()).toBe(
      Duration.fromObject(parts).toMillis(),
    );
  });
});

describe('clampDuration', () => {
  const min = Duration.fromObject({ hours: 1 });
  const max = Duration.fromObject({ hours: 3 });
  it('clamps above max down and below min up', () => {
    expect(clampDuration(Duration.fromObject({ hours: 5 }), min, max)).toBe(
      max,
    );
    expect(clampDuration(Duration.fromObject({ minutes: 30 }), min, max)).toBe(
      min,
    );
  });
  it('passes a value already within bounds through unchanged', () => {
    const v = Duration.fromObject({ hours: 2 });
    expect(clampDuration(v, min, max)).toBe(v);
  });
  it('treats both bounds as optional', () => {
    const v = Duration.fromObject({ hours: 99 });
    expect(clampDuration(v)).toBe(v);
  });
  it('returns the original object (not the bound) at an exact boundary', () => {
    // Strict > / < : a value exactly on a bound passes through by identity.
    const atMax = Duration.fromObject({ hours: 3 });
    const atMin = Duration.fromObject({ hours: 1 });
    expect(clampDuration(atMax, min, max)).toBe(atMax);
    expect(clampDuration(atMin, min, max)).toBe(atMin);
  });
});

describe('serializeDuration', () => {
  const dur = Duration.fromObject({ hours: 2 });

  it('emits total milliseconds for the millis (donor-parity) default', () => {
    expect(serializeDuration(dur, 'millis')).toBe(7_200_000);
  });

  it('caps the millis output at DURATION_MAX_MILLIS', () => {
    const huge = Duration.fromObject({ days: 365 });
    expect(serializeDuration(huge, 'millis')).toBe(DURATION_MAX_MILLIS);
  });

  it('emits an ISO string for iso', () => {
    expect(serializeDuration(dur, 'iso')).toBe(dur.toISO());
  });

  it('passes the Luxon Duration through for luxon', () => {
    expect(serializeDuration(dur, 'luxon')).toBe(dur);
  });

  it('maps null to null in every format', () => {
    for (const format of ['millis', 'iso', 'luxon'] as const) {
      expect(serializeDuration(null, format)).toBeNull();
    }
  });
});
