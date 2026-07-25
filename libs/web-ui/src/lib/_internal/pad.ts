// Zero-fill helpers shared by the date- and duration-pickers so their padded
// readouts (and the duration core's formatter) can't drift. `Math.floor` guards
// the fractional remainder a Luxon `shiftTo` can leave in the smallest unit; it
// is a no-op on the already-integer hour/minute/second fields the date-picker
// feeds in.

/** Floor to an integer and left-pad to 2 digits (e.g. 5 → "05"). */
export const pad2 = (n: number): string =>
  String(Math.floor(n)).padStart(2, '0');

/** Floor to an integer and left-pad to 3 digits (e.g. 7 → "007"). */
export const pad3 = (n: number): string =>
  String(Math.floor(n)).padStart(3, '0');
