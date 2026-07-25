import { DateTime } from 'luxon';
import {
  DATE_FORMAT_PRESETS,
  DATE_PICKER_FORMAT,
  DEFAULT_DATE_FORMAT,
  MINUTE_PRECISION,
  MODE_FORMATS,
  applyMask,
  applyMaskWithSkeleton,
  clampDate,
  firstSlotIndex,
  formatDisplayDate,
  formatForMode,
  formatValue,
  hasMaskPayload,
  maskForMode,
  maskSkeleton,
  nowInZone,
  parseMaskedDate,
  parseValue,
  placeholderForMode,
  resolveTimezone,
  resolveZone,
  serializeDate,
} from './date-picker-core';

// The core is pure, so the parity table is asserted without a DOM (mirrors the
// masked-date core spec).
const d = (year: number, month: number, day: number, zone = 'utc') =>
  DateTime.fromObject({ year, month, day }, { zone });

describe('resolveZone', () => {
  it('returns the supplied zone verbatim', () => {
    expect(resolveZone('America/New_York')).toBe('America/New_York');
  });

  it('returns a zone that differs from the host zone verbatim (no silent fallback)', () => {
    // A fixed-offset zone can never be the host's IANA zone name, so this
    // catches a fallback that only "worked" because the host zone matched.
    expect(resolveZone('UTC+3')).toBe('UTC+3');
    expect(resolveZone('UTC+3')).not.toBe(DateTime.local().zoneName);
  });

  it('falls back to the host local zone when empty/null', () => {
    expect(resolveZone()).toBe(DateTime.local().zoneName);
    expect(resolveZone('')).toBe(DateTime.local().zoneName);
    expect(resolveZone(null)).toBe(DateTime.local().zoneName);
  });
});

describe('formatDisplayDate', () => {
  it('formats a valid date with the default MM/dd/yyyy mask', () => {
    expect(formatDisplayDate(d(2025, 1, 5))).toBe('01/05/2025');
    expect(DATE_PICKER_FORMAT).toBe('MM/dd/yyyy');
  });

  it('honours a custom format', () => {
    expect(formatDisplayDate(d(2025, 12, 31), 'yyyy-MM-dd')).toBe('2025-12-31');
  });

  it('returns an empty string for null/undefined/invalid input', () => {
    expect(formatDisplayDate(null)).toBe('');
    expect(formatDisplayDate(undefined)).toBe('');
    expect(formatDisplayDate(DateTime.invalid('nope'))).toBe('');
  });
});

describe('parseMaskedDate', () => {
  it('parses a complete MM/DD/YYYY string', () => {
    const parsed = parseMaskedDate('12/31/2025', 'utc');
    expect(parsed?.year).toBe(2025);
    expect(parsed?.month).toBe(12);
    expect(parsed?.day).toBe(31);
  });

  it('normalizes unmasked digits through formatDateMask before parsing', () => {
    const parsed = parseMaskedDate('12312025', 'utc');
    expect(parsed?.toFormat(DATE_PICKER_FORMAT)).toBe('12/31/2025');
  });

  it('returns null for partial input', () => {
    expect(parseMaskedDate('12/31')).toBeNull();
    expect(parseMaskedDate('1')).toBeNull();
    expect(parseMaskedDate('')).toBeNull();
  });

  it('returns null for a calendar-invalid date', () => {
    // 13th month never normalizes to a valid MM/dd/yyyy.
    expect(parseMaskedDate('13/01/2025', 'utc')).toBeNull();
  });

  it('interprets the date in the resolved zone', () => {
    const parsed = parseMaskedDate('06/15/2025', 'America/New_York');
    expect(parsed?.zoneName).toBe('America/New_York');
  });

  it('carries a non-host zone through to the parsed DateTime', () => {
    // A fixed offset that can never be the host zone: proves the zone option
    // actually reaches fromFormat instead of defaulting to local.
    const parsed = parseMaskedDate('06/15/2025', 'UTC+3');
    expect(parsed?.zoneName).toBe('UTC+3');
    expect(parsed?.offset).toBe(180);
  });
});

describe('clampDate', () => {
  const min = d(2025, 1, 1);
  const max = d(2025, 12, 31);

  it('returns the date unchanged when inside the window', () => {
    expect(clampDate(d(2025, 6, 15), min, max).toISODate()).toBe('2025-06-15');
  });

  it('clamps to max when above', () => {
    expect(clampDate(d(2026, 3, 1), min, max).toISODate()).toBe('2025-12-31');
  });

  it('clamps to min when below', () => {
    expect(clampDate(d(2024, 3, 1), min, max).toISODate()).toBe('2025-01-01');
  });

  it('returns the original instance (zone intact) when exactly on a bound', () => {
    // Equal instants in different zones compare equal; the clamp must keep the
    // caller's instance so its zone/formatting survives an inclusive bound.
    const onMax = max.setZone('UTC+3');
    expect(clampDate(onMax, min, max)).toBe(onMax);
    const onMin = min.setZone('UTC+3');
    expect(clampDate(onMin, min, max)).toBe(onMin);
  });

  it('treats omitted bounds as unbounded', () => {
    // No bounds: returned unchanged.
    expect(clampDate(d(2030, 1, 1)).toISODate()).toBe('2030-01-01');
    // Min only, date above it: low side unbounded, no max → unchanged.
    expect(clampDate(d(2030, 1, 1), min).toISODate()).toBe('2030-01-01');
    // Max only, date below it: within the max bound → unchanged (the low side
    // is unbounded, so a far-past date is NOT pulled up to max).
    expect(clampDate(d(1999, 1, 1), undefined, max).toISODate()).toBe(
      '1999-01-01',
    );
    // Max only, date above it: clamped down to max.
    expect(clampDate(d(2030, 1, 1), undefined, max).toISODate()).toBe(
      '2025-12-31',
    );
  });
});

describe('resolveTimezone', () => {
  it('maps the fixed standard-time abbreviations to UTC offsets', () => {
    expect(resolveTimezone('UTC')).toBe('UTC');
    expect(resolveTimezone('EST')).toBe('UTC-5');
    expect(resolveTimezone('CST')).toBe('UTC-6');
    expect(resolveTimezone('MST')).toBe('UTC-7');
    expect(resolveTimezone('PST')).toBe('UTC-8');
  });

  it('resolves browser to the host local zone', () => {
    expect(resolveTimezone('browser')).toBe(DateTime.local().zoneName);
  });
});

describe('DATE_FORMAT_PRESETS', () => {
  it('bundles a coherent token/placeholder/mask per preset, ISO by default', () => {
    expect(DATE_FORMAT_PRESETS.iso).toEqual({
      token: 'yyyy-MM-dd',
      placeholder: 'YYYY-MM-DD',
      mask: '9999-99-99',
    });
    expect(DATE_FORMAT_PRESETS.us.token).toBe('MM/dd/yyyy');
    expect(DATE_FORMAT_PRESETS.euro.token).toBe('dd/MM/yyyy');
    expect(DEFAULT_DATE_FORMAT).toBe('iso');
  });
});

describe('MODE_FORMATS / MINUTE_PRECISION', () => {
  it('pins the exported per-mode token table exactly', () => {
    expect(MODE_FORMATS).toEqual({
      date: { h12: 'MM/dd/yyyy', h24: 'MM/dd/yyyy' },
      datetime: { h12: 'MM/dd/yyyy hh:mm a', h24: 'MM/dd/yyyy HH:mm' },
      time: { h12: 'hh:mm a', h24: 'HH:mm' },
    });
  });

  it('pins the backward-compatible minute-only default precision', () => {
    expect(MINUTE_PRECISION).toEqual({ seconds: false, milliseconds: false });
  });
});

describe('formatForMode', () => {
  it('defaults to the ISO date order (donor parity)', () => {
    expect(formatForMode('date', true)).toBe('yyyy-MM-dd');
    expect(formatForMode('date', false)).toBe('yyyy-MM-dd');
    expect(formatForMode('datetime', true)).toBe('yyyy-MM-dd hh:mm a');
    expect(formatForMode('datetime', false)).toBe('yyyy-MM-dd HH:mm');
    expect(formatForMode('time', true)).toBe('hh:mm a');
    expect(formatForMode('time', false)).toBe('HH:mm');
  });

  it('swaps only the date half per dateFormat preset', () => {
    expect(formatForMode('date', true, MINUTE_PRECISION, 'us')).toBe('MM/dd/yyyy');
    expect(formatForMode('date', true, MINUTE_PRECISION, 'euro')).toBe('dd/MM/yyyy');
    expect(formatForMode('datetime', false, MINUTE_PRECISION, 'us')).toBe(
      'MM/dd/yyyy HH:mm',
    );
    // The exported US table and the helper agree.
    expect(MODE_FORMATS.datetime.h24).toBe('MM/dd/yyyy HH:mm');
    // The time-only format ignores the date preset.
    expect(formatForMode('time', true, MINUTE_PRECISION, 'euro')).toBe('hh:mm a');
  });

  it('extends the time half with seconds and milliseconds when requested', () => {
    const sec = { seconds: true, milliseconds: false };
    const ms = { seconds: true, milliseconds: true };
    expect(formatForMode('datetime', true, sec)).toBe(
      'yyyy-MM-dd hh:mm:ss a',
    );
    expect(formatForMode('datetime', false, ms)).toBe(
      'yyyy-MM-dd HH:mm:ss.SSS',
    );
    expect(formatForMode('time', true, ms)).toBe('hh:mm:ss.SSS a');
    // Milliseconds imply seconds even when the caller leaves seconds off.
    expect(formatForMode('time', false, { seconds: false, milliseconds: true })).toBe(
      'HH:mm:ss.SSS',
    );
    // Date mode ignores precision entirely.
    expect(formatForMode('date', true, ms)).toBe('yyyy-MM-dd');
  });
});

describe('maskForMode', () => {
  it('returns the ISO date-only mask by default regardless of clock/precision', () => {
    expect(maskForMode('date', true)).toBe('9999-99-99');
    expect(maskForMode('date', false, { seconds: true, milliseconds: true })).toBe(
      '9999-99-99',
    );
  });

  it('swaps the date-half mask per dateFormat preset', () => {
    expect(maskForMode('date', true, MINUTE_PRECISION, 'us')).toBe('99/99/9999');
    expect(maskForMode('date', true, MINUTE_PRECISION, 'euro')).toBe('99/99/9999');
  });

  it('builds the datetime mask per clock and precision', () => {
    expect(maskForMode('datetime', true)).toBe('9999-99-99 99:99 aa');
    expect(maskForMode('datetime', false)).toBe('9999-99-99 99:99');
    expect(
      maskForMode('datetime', true, { seconds: true, milliseconds: true }),
    ).toBe('9999-99-99 99:99:99.999 aa');
    expect(
      maskForMode('datetime', false, { seconds: true, milliseconds: false }),
    ).toBe('9999-99-99 99:99:99');
  });

  it('builds the time-only mask', () => {
    expect(maskForMode('time', true)).toBe('99:99 aa');
    expect(maskForMode('time', false, { seconds: true, milliseconds: true })).toBe(
      '99:99:99.999',
    );
  });
});

describe('applyMask', () => {
  it('inserts separators as digit slots fill', () => {
    expect(applyMask('06152025', '99/99/9999')).toBe('06/15/2025');
    expect(applyMask('0615', '99/99/9999')).toBe('06/15');
  });

  it('never leaves a separator dangling past the last input', () => {
    expect(applyMask('06', '99/99/9999')).toBe('06');
    expect(applyMask('0615', '99/99/9999')).toBe('06/15');
  });

  it('skips characters that do not match the current slot type', () => {
    // Pre-punctuated input collapses back to the canonical mask.
    expect(applyMask('06/15/2025', '99/99/9999')).toBe('06/15/2025');
    expect(applyMask('03:30', '99:99')).toBe('03:30');
  });

  it('upper-cases letters into alpha (meridiem) slots', () => {
    expect(applyMask('0330pm', '99:99 aa')).toBe('03:30 PM');
    expect(applyMask('1145AM', '99:99 aa')).toBe('11:45 AM');
  });

  it('guides a full datetime entry across both halves', () => {
    expect(
      applyMask('061520250330453pm', '99/99/9999 99:99:99.9 aa'),
    ).toBe('06/15/2025 03:30:45.3 PM');
  });
});

describe('formatValue', () => {
  // A fixed UTC instant at 18:30 — used to prove the zone shift.
  const instant = DateTime.fromISO('2025-06-15T18:30:00', { zone: 'utc' });

  it('formats date-only regardless of clock (ISO default)', () => {
    expect(formatValue(instant, 'date', true, 'UTC')).toBe('2025-06-15');
  });

  it('shifts the wall-clock into the selected fixed zone (12h)', () => {
    // 18:30 UTC → 13:30 at UTC-5 (EST).
    expect(formatValue(instant, 'datetime', true, 'EST')).toBe(
      '2025-06-15 01:30 PM',
    );
    // …and 10:30 at UTC-8 (PST), 24h.
    expect(formatValue(instant, 'datetime', false, 'PST')).toBe(
      '2025-06-15 10:30',
    );
  });

  it('honours a non-default dateFormat preset (us)', () => {
    expect(
      formatValue(instant, 'datetime', false, 'EST', MINUTE_PRECISION, 'us'),
    ).toBe('06/15/2025 13:30');
  });

  it('formats time-only', () => {
    expect(formatValue(instant, 'time', false, 'UTC')).toBe('18:30');
  });

  it('returns empty for null/invalid', () => {
    expect(formatValue(null, 'datetime', true)).toBe('');
    expect(formatValue(DateTime.invalid('x'), 'date', true)).toBe('');
  });
});

describe('parseValue', () => {
  it('round-trips datetime entry in the selected zone (12h, ISO default)', () => {
    const parsed = parseValue('2025-06-15 01:30 PM', 'datetime', true, 'EST');
    expect(parsed?.isValid).toBe(true);
    // Re-formatting in the same zone returns the typed string.
    expect(formatValue(parsed, 'datetime', true, 'EST')).toBe(
      '2025-06-15 01:30 PM',
    );
  });

  it('round-trips a us-format datetime entry', () => {
    const parsed = parseValue(
      '06/15/2025 01:30 PM',
      'datetime',
      true,
      'EST',
      MINUTE_PRECISION,
      'us',
    );
    expect(parsed?.isValid).toBe(true);
    expect(
      formatValue(parsed, 'datetime', true, 'EST', MINUTE_PRECISION, 'us'),
    ).toBe('06/15/2025 01:30 PM');
  });

  it('self-heals an unmasked date segment before parsing datetime', () => {
    const parsed = parseValue('20251231 03:00 PM', 'datetime', true, 'UTC');
    expect(formatValue(parsed, 'datetime', true, 'UTC')).toBe(
      '2025-12-31 03:00 PM',
    );
  });

  it('parses time-only entry', () => {
    const parsed = parseValue('09:45', 'time', false, 'UTC');
    expect(parsed?.hour).toBe(9);
    expect(parsed?.minute).toBe(45);
  });

  it('round-trips a high-precision datetime (seconds + milliseconds)', () => {
    const ms = { seconds: true, milliseconds: true };
    const parsed = parseValue(
      '2025-06-15 01:30:45.123 PM',
      'datetime',
      true,
      'UTC',
      ms,
    );
    expect(parsed?.second).toBe(45);
    expect(parsed?.millisecond).toBe(123);
    expect(formatValue(parsed, 'datetime', true, 'UTC', ms)).toBe(
      '2025-06-15 01:30:45.123 PM',
    );
  });

  it('self-heals an unmasked high-precision entry', () => {
    const ms = { seconds: true, milliseconds: true };
    const parsed = parseValue(
      '20250630101530525',
      'datetime',
      false,
      'UTC',
      ms,
    );
    expect(formatValue(parsed, 'datetime', false, 'UTC', ms)).toBe(
      '2025-06-30 10:15:30.525',
    );
  });

  it('rejects malformed / incomplete input', () => {
    expect(parseValue('', 'datetime', true)).toBeNull();
    expect(parseValue('06/15/2025', 'datetime', true)).toBeNull();
    expect(parseValue('25:99', 'time', false)).toBeNull();
    expect(parseValue('13/40/2025', 'date', true)).toBeNull();
  });
});

describe('nowInZone', () => {
  it('returns the current instant in the resolved zone', () => {
    expect(nowInZone('EST').zoneName).toBe('UTC-5');
    expect(nowInZone('UTC').zoneName).toBe('UTC');
    // Close to "now" (within a minute) — proves it isn't a fixed/zero date.
    expect(Math.abs(nowInZone('UTC').diffNow().as('seconds'))).toBeLessThan(60);
  });
});

describe('placeholderForMode', () => {
  it('returns the ISO date-only hint by default regardless of clock/precision', () => {
    expect(placeholderForMode('date', true)).toBe('YYYY-MM-DD');
    expect(
      placeholderForMode('date', false, { seconds: true, milliseconds: true }),
    ).toBe('YYYY-MM-DD');
  });

  it('swaps the date-half hint per dateFormat preset', () => {
    expect(placeholderForMode('date', true, MINUTE_PRECISION, 'us')).toBe('MM/DD/YYYY');
    expect(placeholderForMode('date', true, MINUTE_PRECISION, 'euro')).toBe('DD/MM/YYYY');
  });

  it('builds the datetime hint per clock and precision', () => {
    expect(placeholderForMode('datetime', true)).toBe('YYYY-MM-DD HH:MM AM/PM');
    expect(placeholderForMode('datetime', false)).toBe('YYYY-MM-DD HH:MM');
    expect(
      placeholderForMode('datetime', true, { seconds: true, milliseconds: true }),
    ).toBe('YYYY-MM-DD HH:MM:SS.SSS AM/PM');
    expect(
      placeholderForMode('datetime', false, { seconds: true, milliseconds: false }),
    ).toBe('YYYY-MM-DD HH:MM:SS');
  });

  it('builds the time-only hint', () => {
    expect(placeholderForMode('time', true)).toBe('HH:MM AM/PM');
    expect(
      placeholderForMode('time', false, { seconds: true, milliseconds: true }),
    ).toBe('HH:MM:SS.SSS');
  });
});

describe('maskSkeleton', () => {
  it('replaces digit/alpha slots with the slot char and keeps separators', () => {
    expect(maskSkeleton('99/99/9999')).toBe('__/__/____');
    expect(maskSkeleton('99/99/9999 99:99:99.999 aa')).toBe(
      '__/__/____ __:__:__.___ __',
    );
  });

  it('honours a custom slot char', () => {
    expect(maskSkeleton('99:99', '#')).toBe('##:##');
  });
});

describe('firstSlotIndex', () => {
  it('finds the first editable slot', () => {
    expect(firstSlotIndex('99/99/9999')).toBe(0);
    expect(firstSlotIndex('-- 99')).toBe(3);
  });
});

describe('hasMaskPayload', () => {
  it('is false for an untouched skeleton or empty string', () => {
    expect(hasMaskPayload('')).toBe(false);
    expect(hasMaskPayload('__/__/____')).toBe(false);
    expect(hasMaskPayload('  /  /    ')).toBe(false);
  });

  it('is true once any digit or letter is present', () => {
    expect(hasMaskPayload('1_/__/____')).toBe(true);
    expect(hasMaskPayload('__:__ _M')).toBe(true);
  });
});

describe('applyMaskWithSkeleton', () => {
  it('parks the caret at the first slot for an empty entry', () => {
    expect(applyMaskWithSkeleton('', '99/99/9999')).toEqual({
      text: '__/__/____',
      caret: 0,
    });
  });

  it('fills slots left-to-right, padding the rest with the slot char', () => {
    expect(applyMaskWithSkeleton('1', '99/99/9999')).toEqual({
      text: '1_/__/____',
      caret: 1,
    });
    // After a full month, the caret skips the separator into the day slot.
    expect(applyMaskWithSkeleton('12', '99/99/9999')).toEqual({
      text: '12/__/____',
      caret: 3,
    });
    expect(applyMaskWithSkeleton('123', '99/99/9999')).toEqual({
      text: '12/3_/____',
      caret: 4,
    });
  });

  it('renders a full datetime entry and parks the caret at the end', () => {
    const { text, caret } = applyMaskWithSkeleton(
      '061520250330453pm',
      '99/99/9999 99:99:99.9 aa',
    );
    expect(text).toBe('06/15/2025 03:30:45.3 PM');
    expect(caret).toBe(24);
  });

  it('ignores existing slot chars and separators when re-deriving', () => {
    expect(applyMaskWithSkeleton('12/__/____', '99/99/9999')).toEqual({
      text: '12/__/____',
      caret: 3,
    });
  });
});

describe('serializeDate', () => {
  const dt = DateTime.fromISO('2026-06-15T08:30:00.000Z');

  it('emits a JS Date for the native (donor-parity) default', () => {
    const out = serializeDate(dt, 'native');
    expect(out).toBeInstanceOf(Date);
    expect((out as Date).getTime()).toBe(dt.toJSDate().getTime());
  });

  it('emits an ISO string for iso', () => {
    expect(serializeDate(dt, 'iso')).toBe(dt.toISO());
  });

  it('passes the Luxon DateTime through for luxon', () => {
    expect(serializeDate(dt, 'luxon')).toBe(dt);
  });

  it('maps null and invalid values to null in every format', () => {
    const invalid = DateTime.fromISO('not-a-date');
    for (const format of ['native', 'iso', 'luxon'] as const) {
      expect(serializeDate(null, format)).toBeNull();
      expect(serializeDate(invalid, format)).toBeNull();
    }
  });
});
