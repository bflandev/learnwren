// Pure parse / format / clamp / timezone logic for the date-picker — no Angular,
// no DOM — so the behaviour unit-tests as a plain table and the component stays a
// thin shell. Mirrors the lib's other pure cores (`formatDateMask`).
import { DateTime } from 'luxon';
import {
  DATE_FORMAT_PRESETS,
  DEFAULT_DATE_FORMAT,
  applyMask,
  formatDateMask,
  type DateFormatPreset,
} from '../masked-date/masked-date-core';

// Re-export the shared pure mask primitives from their home one layer down
// (masked-date-core) so existing `from './date-picker-core'` importers — the
// picker component, the duration-picker, and the date-picker barrel — keep their
// path. The definitions moved so the masked-date directive can share them without
// a circular import.
export {
  DATE_FORMAT_PRESETS,
  DEFAULT_DATE_FORMAT,
  MASK_SLOT_CHAR,
  applyMask,
  applyMaskWithSkeleton,
  firstSlotIndex,
  hasMaskPayload,
  maskSkeleton,
  type DateFormatPreset,
  type DateFormatSpec,
} from '../masked-date/masked-date-core';

// Display + keyboard-entry format; matches the `hlmMaskedDate` directive's `us`
// preset — the registry is the single source so they can't drift.
export const DATE_PICKER_FORMAT = DATE_FORMAT_PRESETS.us.token;

export type DatePickerMode = 'date' | 'datetime' | 'time';

// `browser` follows the host's local zone; the rest map to FIXED offsets (no DST)
// so an instant renders the same wall-clock year-round (the donor app's picker behaviour).
export type TimezoneOption = 'browser' | 'UTC' | 'EST' | 'CST' | 'MST' | 'PST';

export const TIMEZONE_FIXED_ZONES: Record<
  Exclude<TimezoneOption, 'browser'>,
  string
> = {
  UTC: 'UTC',
  EST: 'UTC-5',
  CST: 'UTC-6',
  MST: 'UTC-7',
  PST: 'UTC-8',
};

// Per-mode + per-clock Luxon tokens (12h `hh:mm a`, 24h `HH:mm`) at the base
// minute precision. Exported for the spec; `formatForMode` extends these with
// seconds/milliseconds when the caller opts in.
export const MODE_FORMATS: Record<DatePickerMode, { h12: string; h24: string }> =
  {
    date: { h12: DATE_PICKER_FORMAT, h24: DATE_PICKER_FORMAT },
    datetime: {
      h12: `${DATE_PICKER_FORMAT} hh:mm a`,
      h24: `${DATE_PICKER_FORMAT} HH:mm`,
    },
    time: { h12: 'hh:mm a', h24: 'HH:mm' },
  };

// How much of the time half a datetime/time field carries. `milliseconds`
// implies `seconds` (a `.SSS` tail is meaningless without a `:ss` segment), so
// the helpers below normalize that pairing rather than trusting the caller.
export interface TimePrecision {
  readonly seconds: boolean;
  readonly milliseconds: boolean;
}

// The default precision — minute only — keeps `formatForMode`/`formatValue`/
// `parseValue` backward compatible with their pre-precision callers (and the
// pure spec table). The component opts into seconds/ms for donor parity.
export const MINUTE_PRECISION: TimePrecision = {
  seconds: false,
  milliseconds: false,
};

/** Resolve a timezone lever to a Luxon zone string (`browser` → host local zone). */
export function resolveTimezone(option: TimezoneOption): string {
  if (option === 'browser') return DateTime.local().zoneName;
  return TIMEZONE_FIXED_ZONES[option];
}

// The time-half Luxon token for a clock + precision, e.g. `hh:mm:ss.SSS a` /
// `HH:mm`. Milliseconds force seconds on so the `.SSS` always trails a `:ss`.
function timeToken(hour12: boolean, precision: TimePrecision): string {
  let token = hour12 ? 'hh:mm' : 'HH:mm';
  if (precision.seconds || precision.milliseconds) token += ':ss';
  if (precision.milliseconds) token += '.SSS';
  return hour12 ? `${token} a` : token;
}

/** The Luxon format token for a mode + clock + precision + date-order pairing. */
export function formatForMode(
  mode: DatePickerMode,
  hour12: boolean,
  precision: TimePrecision = MINUTE_PRECISION,
  dateFormat: DateFormatPreset = DEFAULT_DATE_FORMAT,
): string {
  const dateToken = DATE_FORMAT_PRESETS[dateFormat].token;
  if (mode === 'date') return dateToken;
  const time = timeToken(hour12, precision);
  return mode === 'time' ? time : `${dateToken} ${time}`;
}

/**
 * A human-readable format hint for a mode + clock + precision + date order, e.g.
 * `YYYY-MM-DD HH:MM:SS.SSS AM/PM`. Shown as the empty field's placeholder so the
 * expected entry shape is visible before focus — the format tracks the same
 * levers as `maskForMode`/`formatForMode`. The date half follows the dateFormat
 * preset; the time half mirrors the HH:MM:SS.SSS AM/PM vocabulary.
 */
export function placeholderForMode(
  mode: DatePickerMode,
  hour12: boolean,
  precision: TimePrecision = MINUTE_PRECISION,
  dateFormat: DateFormatPreset = DEFAULT_DATE_FORMAT,
): string {
  const datePlaceholder = DATE_FORMAT_PRESETS[dateFormat].placeholder;
  if (mode === 'date') return datePlaceholder;
  let time = 'HH:MM';
  if (precision.seconds || precision.milliseconds) time += ':SS';
  if (precision.milliseconds) time += '.SSS';
  if (hour12) time += ' AM/PM';
  return mode === 'time' ? time : `${datePlaceholder} ${time}`;
}

// Mask template grammar: `9` is a digit slot, `a` an alpha (meridiem) slot, and
// every other character is a literal separator — so the date AND time halves are
// guided, not just the date. The date half's slots/separators follow the preset.

/** The mask template for a mode + clock + precision + date order, e.g. `yyyy-MM-dd` → `9999-99-99 99:99:99.999 aa`. */
export function maskForMode(
  mode: DatePickerMode,
  hour12: boolean,
  precision: TimePrecision = MINUTE_PRECISION,
  dateFormat: DateFormatPreset = DEFAULT_DATE_FORMAT,
): string {
  const dateMask = DATE_FORMAT_PRESETS[dateFormat].mask;
  if (mode === 'date') return dateMask;
  let time = '99:99';
  if (precision.seconds || precision.milliseconds) time += ':99';
  if (precision.milliseconds) time += '.999';
  if (hour12) time += ' aa';
  return mode === 'time' ? time : `${dateMask} ${time}`;
}

/** IANA zone to interpret/emit dates in; falls back to the host's local zone. */
export function resolveZone(zone?: string | null): string {
  return zone && zone.length > 0 ? zone : DateTime.local().zoneName;
}

/** Format a date for the trigger; '' for null/invalid so the caller can show a placeholder. */
export function formatDisplayDate(
  date: DateTime | null | undefined,
  format: string = DATE_PICKER_FORMAT,
): string {
  if (!date || !date.isValid) return '';
  return date.toFormat(format);
}

/**
 * Parse a masked MM/DD/YYYY string to a DateTime in the resolved zone. Normalizes
 * through `formatDateMask` first; returns null until a full, valid 10-char date.
 */
export function parseMaskedDate(
  masked: string,
  zone?: string | null,
): DateTime | null {
  const normalized = formatDateMask(masked);
  if (normalized.length !== 10) return null;
  const parsed = DateTime.fromFormat(normalized, DATE_PICKER_FORMAT, {
    zone: resolveZone(zone),
  });
  return parsed.isValid ? parsed : null;
}

/** Clamp a date to [min, max] (inclusive); either bound optional, min wins if inverted. */
export function clampDate(
  date: DateTime,
  min?: DateTime | null,
  max?: DateTime | null,
): DateTime {
  let result = date;
  if (max && result > max) result = max;
  if (min && result < min) result = min;
  return result;
}

/**
 * Format a value for the trigger/field per mode + clock, shifted into the timezone
 * lever's zone. Returns '' for null/invalid so the caller can show a placeholder.
 */
export function formatValue(
  value: DateTime | null | undefined,
  mode: DatePickerMode,
  hour12: boolean,
  timezone: TimezoneOption = 'browser',
  precision: TimePrecision = MINUTE_PRECISION,
  dateFormat: DateFormatPreset = DEFAULT_DATE_FORMAT,
): string {
  if (!value || !value.isValid) return '';
  return value.setZone(resolveTimezone(timezone)).toFormat(
    formatForMode(mode, hour12, precision, dateFormat),
  );
}

/**
 * Parse typed entry back to a DateTime per mode + clock + precision. The raw
 * string is first guided through the matching mask (`applyMask`) so both the
 * date AND time halves self-heal — unmasked digits, dropped separators, and
 * lower-case meridiems all converge before the strict format match. Returns
 * null on malformed/incomplete input.
 */
export function parseValue(
  raw: string,
  mode: DatePickerMode,
  hour12: boolean,
  timezone: TimezoneOption = 'browser',
  precision: TimePrecision = MINUTE_PRECISION,
  dateFormat: DateFormatPreset = DEFAULT_DATE_FORMAT,
): DateTime | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const normalized = applyMask(
    trimmed,
    maskForMode(mode, hour12, precision, dateFormat),
  );
  const parsed = DateTime.fromFormat(
    normalized,
    formatForMode(mode, hour12, precision, dateFormat),
    { zone: resolveTimezone(timezone) },
  );
  return parsed.isValid ? parsed : null;
}

/** Current instant in the resolved zone — backs the "capture current time" button. */
export function nowInZone(timezone: TimezoneOption = 'browser'): DateTime {
  return DateTime.now().setZone(resolveTimezone(timezone));
}

// Serialized shape for the dedicated `serializedChange` output — the donor-facing
// contract that lets the Luxon-native picker drop into a donor-style form. `native`
// (default) emits a JS Date, matching the donor app's datepicker control value; `iso` an
// ISO-8601 string; `luxon` the raw DateTime (parity with `[(value)]`).
export type DateOutputFormat = 'native' | 'iso' | 'luxon';

/** Serialize the picker's Luxon value per `valueFormat`; null/invalid → null. */
export function serializeDate(
  value: DateTime | null,
  format: DateOutputFormat,
): Date | string | DateTime | null {
  if (!value || !value.isValid) return null;
  if (format === 'iso') return value.toISO();
  if (format === 'luxon') return value;
  return value.toJSDate();
}
