/**
 * Accept only same-origin path redirects. Rejects:
 *   - Empty strings
 *   - Anything not starting with `/`
 *   - Protocol-relative URLs (`//evil.com/...`)
 *   - Backslash-after-slash variants browsers may also treat as protocol-relative (`/\evil.com`)
 * A bare `/` is accepted (root) because the second char is `undefined`.
 *
 * Note: Unicode lookalike slashes (U+2215 DIVISION SLASH, U+FF0F FULLWIDTH SOLIDUS)
 * are intentionally not handled — the router treats them as literal path characters,
 * so they are not a browser-redirect threat.
 */
export function isSafeRedirect(r: string): boolean {
  // Stryker disable next-line ConditionalExpression,EqualityOperator: `r.length > 0` is fully implied by the next clause — String.prototype.startsWith('/') can only return true when r has length >= 1, so an empty string is already rejected by `r.startsWith('/')`. Forcing this clause to `true` (or `>= 0`) leaves the overall conjunction's value unchanged for every input; equivalent.
  return r.length > 0 && r.startsWith('/') && r[1] !== '/' && r[1] !== '\\';
}

/** The `redirect` query param when it is a safe same-origin path, else null. */
export function safeRedirectParam(params: { get(name: string): string | null } | null | undefined): string | null {
  const r = params?.get('redirect');
  return r && isSafeRedirect(r) ? r : null;
}
