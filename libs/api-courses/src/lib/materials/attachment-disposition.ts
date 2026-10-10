/** Anything a quoted-string filename cannot carry as-is in an HTTP header. */
const UNSAFE_IN_QUOTED_FILENAME = /[^\x20-\x7e]|["\\]/g;

/**
 * `Content-Disposition: attachment` for a user-supplied filename. Header values
 * must be ASCII (Node's setHeader throws on anything past U+00FF, so an en dash
 * or a curly apostrophe made every download a 500), so a name that is not plain
 * ASCII gets an underscored fallback plus the RFC 5987 `filename*` that
 * browsers use to show the real name.
 */
export function attachmentDisposition(filename: string): string {
  const fallback = filename.replace(UNSAFE_IN_QUOTED_FILENAME, '_');
  if (fallback === filename) return `attachment; filename="${filename}"`;
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(filename)}`;
}

/** A surrogate half without its partner; encodeURIComponent throws on one. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value.replace(LONE_SURROGATE, '\uFFFD')).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
