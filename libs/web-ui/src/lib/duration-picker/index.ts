export {
  DURATION_PICKER_TRIGGER_BASE,
  HlmDurationPicker,
} from './hlm-duration-picker.component';
// NOTE: `applyMask` and `MINUTE_PRECISION` are intentionally NOT re-exported —
// the date-picker barrel already owns those public names, and a second export
// would collide under the @shared/ui `export *`.
export {
  DURATION_MAX_MILLIS,
  clampDuration,
  durationToParts,
  formatDuration,
  maskForDuration,
  parseDuration,
  partsToDuration,
  placeholderForDuration,
  serializeDuration,
  type DurationOutputFormat,
  type DurationParts,
  type DurationPrecision,
} from './duration-picker-core';
