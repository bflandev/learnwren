// Pure, DOM-free, luxon-free mask primitives shared by the masked-date directive
// and the date-picker core. Kept in the masked-date layer (the lowest of the two)
// so both can import them without a circular dependency — the date-picker core
// re-exports the set so its own importers keep their path. Unit-tests as a plain
// table.

// Insert-and-heal MM/DD/YYYY core: keep digits only, cap at 8 (MMDDYYYY), insert
// the two slashes once enough digits exist. Backs the date-picker's US parse path
// and any consumer that wants to format a seed value to the canonical US shape.
export function formatDateMask(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 8);
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += '/' + digits.slice(2, 4);
  if (digits.length > 4) out += '/' + digits.slice(4, 8);
  return out;
}

// Selectable date-half order + separator. The DATE order is the only axis a
// preset controls; the time half stays driven by hour12 + precision. `iso`
// (yyyy-MM-dd) mirrors slem-monorepo's datepicker default; `us` keeps the
// MM/dd/yyyy order, `euro` the dd/MM/yyyy one.
export type DateFormatPreset = 'iso' | 'us' | 'euro';

export interface DateFormatSpec {
  /** Luxon date-half token, e.g. `yyyy-MM-dd`. */
  readonly token: string;
  /** Human-readable date-half placeholder, e.g. `YYYY-MM-DD`. */
  readonly placeholder: string;
  /** Date-half mask template (`9` = digit slot), e.g. `9999-99-99`. */
  readonly mask: string;
}

// One bundle per preset so the format token, placeholder hint, and mask template
// can never drift out of order/separator agreement.
export const DATE_FORMAT_PRESETS: Record<DateFormatPreset, DateFormatSpec> = {
  iso: { token: 'yyyy-MM-dd', placeholder: 'YYYY-MM-DD', mask: '9999-99-99' },
  us: { token: 'MM/dd/yyyy', placeholder: 'MM/DD/YYYY', mask: '99/99/9999' },
  euro: { token: 'dd/MM/yyyy', placeholder: 'DD/MM/YYYY', mask: '99/99/9999' },
};

// Default date order — ISO (yyyy-MM-dd), matching slem-monorepo's datepicker.
export const DEFAULT_DATE_FORMAT: DateFormatPreset = 'iso';

const isDigit = (c: string): boolean => c >= '0' && c <= '9';
const isAlpha = (c: string): boolean =>
  (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

/**
 * Guide raw keystrokes into a mask template: digits fill `9` slots, letters fill
 * `a` slots (upper-cased), and literal separators are inserted automatically as
 * the slots ahead of them fill. Non-matching characters are skipped, and a
 * separator is never left dangling past the last consumed input — so partial
 * entry reads `06/15/2025 03` rather than `06/15/2025 03:`.
 */
export function applyMask(raw: string, template: string): string {
  let out = '';
  let pending = '';
  let i = 0;
  for (const slot of template) {
    if (slot === '9' || slot === 'a') {
      const match = slot === '9' ? isDigit : isAlpha;
      while (i < raw.length && !match(raw.charAt(i))) i++;
      if (i >= raw.length) break;
      out += pending + (slot === 'a' ? raw.charAt(i).toUpperCase() : raw.charAt(i));
      pending = '';
      i++;
    } else {
      pending += slot;
    }
  }
  return out;
}

// Default slot glyph for the focus skeleton — matches p-inputMask's `_` slotChar.
export const MASK_SLOT_CHAR = '_';

/**
 * The full-width slot skeleton for a mask template, e.g. `__/__/____` or
 * `__/__/____ __:__:__.___ __`. Each `9`/`a` slot becomes `slotChar`; literal
 * separators are kept. Revealed on focus so the entry shape is visible in place.
 */
export function maskSkeleton(
  template: string,
  slotChar: string = MASK_SLOT_CHAR,
): string {
  let out = '';
  for (const ch of template) {
    out += ch === '9' || ch === 'a' ? slotChar : ch;
  }
  return out;
}

/** Index of the first editable (`9`/`a`) slot in a template; template length if none. */
export function firstSlotIndex(template: string): number {
  let i = 0;
  while (i < template.length && template[i] !== '9' && template[i] !== 'a') i++;
  return i;
}

/** True when `raw` carries at least one mask payload char (digit or letter). */
export function hasMaskPayload(raw: string): boolean {
  for (const c of raw) if (isDigit(c) || isAlpha(c)) return true;
  return false;
}

/**
 * Fill a mask template with the payload of `raw` left-to-right, keeping the
 * remaining slots as `slotChar` so the field reads as a slot skeleton mid-entry
 * (`12/3_/____`) — the overwrite-in-place model classic input-mask widgets use, unlike
 * the insert-and-heal `applyMask`. Returns the rendered `text` (always the full
 * template width) and the `caret` index just past the last filled slot, advanced
 * over any trailing separators so the next keystroke lands in the next slot.
 */
export function applyMaskWithSkeleton(
  raw: string,
  template: string,
  slotChar: string = MASK_SLOT_CHAR,
): { text: string; caret: number } {
  let text = '';
  let i = 0;
  let lastFilledEnd = -1;
  for (const slot of template) {
    if (slot === '9' || slot === 'a') {
      const match = slot === '9' ? isDigit : isAlpha;
      while (i < raw.length && !match(raw.charAt(i))) i++;
      if (i < raw.length) {
        text += slot === 'a' ? raw.charAt(i).toUpperCase() : raw.charAt(i);
        lastFilledEnd = text.length;
        i++;
      } else {
        text += slotChar;
      }
    } else {
      text += slot;
    }
  }
  // Park the caret at the start of the next slot (skip the literal separators
  // that follow the last filled slot); an empty entry sits at the first slot.
  let caret = lastFilledEnd < 0 ? firstSlotIndex(template) : lastFilledEnd;
  while (caret < template.length && template[caret] !== '9' && template[caret] !== 'a') {
    caret++;
  }
  return { text, caret };
}
