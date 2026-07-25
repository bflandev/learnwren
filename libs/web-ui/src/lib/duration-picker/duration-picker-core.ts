// Pure parse / format / clamp logic for the duration-picker — no Angular, no
// DOM — so the behaviour unit-tests as a plain table and the component stays a
// thin shell. Mirrors the date-picker's pure core. The model is a Luxon
// `Duration`; entry is clock-style (HH:mm at minute precision), with hours as
// the largest unit by default and an optional leading days segment.
import { Duration } from 'luxon';
import { pad2, pad3 } from '../_internal/pad';
// Single source of the generic mask-guide logic — shared with the date-picker
// rather than duplicated, so the two pickers self-heal keystrokes identically.
// Imported from masked-date-core (the lowest, luxon-free layer) directly rather
// than via the date-picker re-export, so duration-picker takes no sibling
// dependency on date-picker. Imported (not re-exported) — the date-picker barrel
// already owns the public `applyMask`, so re-exporting it here would collide
// under the @shared/ui `export *`.
import { applyMask } from '../masked-date/masked-date-core';

// How much of the duration a field carries below minutes. `milliseconds` implies
// `seconds` (a `.SSS` tail is meaningless without a `:ss` segment); the helpers
// normalize that pairing rather than trusting the caller.
export interface DurationPrecision {
  readonly seconds: boolean;
  readonly milliseconds: boolean;
}

// The default — minute only — keeps the helpers backward compatible with their
// minute-precision callers and the pure spec table.
export const MINUTE_PRECISION: DurationPrecision = {
  seconds: false,
  milliseconds: false,
};

/**
 * The mask template for a duration field, e.g. `99:99`, `99:99:99.999`, or
 * `999 99:99` with the optional leading days segment. `9` is a digit slot; every
 * other character is a literal separator (the `applyMask` grammar).
 */
export function maskForDuration(
  showDays: boolean,
  precision: DurationPrecision = MINUTE_PRECISION,
): string {
  let mask = showDays ? '999 99:99' : '99:99';
  if (precision.seconds || precision.milliseconds) mask += ':99';
  if (precision.milliseconds) mask += '.999';
  return mask;
}

/** A human placeholder hint matching the mask, e.g. `hh:mm`, `ddd hh:mm:ss.sss`. */
export function placeholderForDuration(
  showDays: boolean,
  precision: DurationPrecision = MINUTE_PRECISION,
): string {
  let hint = showDays ? 'ddd hh:mm' : 'hh:mm';
  if (precision.seconds || precision.milliseconds) hint += ':ss';
  if (precision.milliseconds) hint += '.sss';
  return hint;
}

/**
 * Format a Duration for the field. Shifts into a normalized component set
 * (hours-led, or days-led when `showDays`), zero-pads each segment, and trails
 * seconds / milliseconds per precision. Returns '' for null/invalid so the
 * caller can show a placeholder.
 */
export function formatDuration(
  value: Duration | null | undefined,
  showDays: boolean,
  precision: DurationPrecision = MINUTE_PRECISION,
): string {
  if (!value || !value.isValid) return '';
  const shifted = showDays
    ? value.shiftTo('days', 'hours', 'minutes', 'seconds', 'milliseconds')
    : value.shiftTo('hours', 'minutes', 'seconds', 'milliseconds');
  const o = shifted.toObject();
  let out = `${pad2(o.hours ?? 0)}:${pad2(o.minutes ?? 0)}`;
  if (precision.seconds || precision.milliseconds)
    out += `:${pad2(o.seconds ?? 0)}`;
  if (precision.milliseconds) out += `.${pad3(o.milliseconds ?? 0)}`;
  if (showDays) out = `${pad3(o.days ?? 0)} ${out}`;
  return out;
}

/**
 * Parse typed entry back to a Duration. The raw string is first guided through
 * the matching mask (`applyMask`) so dropped separators self-heal; entry must be
 * complete (the masked output fills the whole template) or null is returned.
 */
export function parseDuration(
  raw: string,
  showDays: boolean,
  precision: DurationPrecision = MINUTE_PRECISION,
): Duration | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const template = maskForDuration(showDays, precision);
  const normalized = applyMask(trimmed, template);
  // Require a complete entry — a partial mask fill is treated as not-yet-valid.
  if (normalized.length !== template.length) return null;
  const nums = (normalized.match(/[0-9]+/g) ?? []).map(Number);
  let i = 0;
  const days = showDays ? nums[i++] : 0;
  const hours = nums[i++];
  const minutes = nums[i++];
  const seconds = precision.seconds || precision.milliseconds ? nums[i++] : 0;
  const milliseconds = precision.milliseconds ? nums[i++] : 0;
  if (
    [days, hours, minutes, seconds, milliseconds].some(
      (n) => n === undefined || Number.isNaN(n),
    )
  ) {
    return null;
  }
  const duration = Duration.fromObject({
    days,
    hours,
    minutes,
    seconds,
    milliseconds,
  });
  return duration.isValid ? duration : null;
}

// The per-unit breakdown the segmented input edits — one box per field. Days
// fold into hours when `showDays` is off (matching the masked field's hours-led
// shape), so the two input modes round-trip the same Duration.
export interface DurationParts {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly milliseconds: number;
}

/**
 * Split a Duration into whole-number component parts for the segmented inputs.
 * Shifts into a days-led (or hours-led) component set so each box shows a
 * normalized value, and floors each so a box never shows a fraction. Returns all
 * zeros for null/invalid.
 */
export function durationToParts(
  value: Duration | null | undefined,
  showDays: boolean,
): DurationParts {
  if (!value || !value.isValid) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: 0 };
  }
  const shifted = showDays
    ? value.shiftTo('days', 'hours', 'minutes', 'seconds', 'milliseconds')
    : value.shiftTo('hours', 'minutes', 'seconds', 'milliseconds');
  const o = shifted.toObject();
  return {
    days: Math.floor(o.days ?? 0),
    hours: Math.floor(o.hours ?? 0),
    minutes: Math.floor(o.minutes ?? 0),
    seconds: Math.floor(o.seconds ?? 0),
    milliseconds: Math.floor(o.milliseconds ?? 0),
  };
}

/**
 * Rebuild a Duration from component parts (the inverse of `durationToParts`).
 * Luxon does not auto-normalize an out-of-range part (e.g. 75 minutes), so the
 * caller reformats via the component set on the next render. Returns null for an
 * invalid combination.
 */
export function partsToDuration(parts: DurationParts): Duration | null {
  const duration = Duration.fromObject({ ...parts });
  return duration.isValid ? duration : null;
}

/** Clamp a duration to [min, max] (inclusive); either bound optional, min wins if inverted. */
export function clampDuration(
  value: Duration,
  min?: Duration | null,
  max?: Duration | null,
): Duration {
  let result = value;
  if (max && result.toMillis() > max.toMillis()) result = max;
  if (min && result.toMillis() < min.toMillis()) result = min;
  return result;
}

// the donor app's duration control caps the stored ms at int32 max (~24.8 days); the
// `millis` serializer mirrors that so a value never exceeds what a donor-style form
// would persist.
export const DURATION_MAX_MILLIS = 2147483647;

// Serialized shape for the dedicated `serializedChange` output — the donor-facing
// contract that lets the Luxon-native picker drop into a donor-style form. `millis`
// (default) emits a number of total milliseconds, matching the donor app's duration
// control value (capped at DURATION_MAX_MILLIS); `iso` an ISO-8601 duration
// string; `luxon` the raw Duration (parity with `[(value)]`).
export type DurationOutputFormat = 'millis' | 'iso' | 'luxon';

/** Serialize the picker's Luxon value per `valueFormat`; null/invalid → null. */
export function serializeDuration(
  value: Duration | null,
  format: DurationOutputFormat,
): number | string | Duration | null {
  if (!value || !value.isValid) return null;
  if (format === 'iso') return value.toISO();
  if (format === 'luxon') return value;
  return Math.min(value.toMillis(), DURATION_MAX_MILLIS);
}
