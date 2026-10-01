function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Deep copy with `undefined` object properties removed: what Firestore's
 * `ignoreUndefinedProperties` does on write. Arrays and plain objects are
 * copied; everything else (including the port's symbols) passes through.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => stripUndefined(item)) as T;
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined) out[key] = stripUndefined(field);
  }
  return out as T;
}
