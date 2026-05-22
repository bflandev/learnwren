/** URL path prefixes whose pages render without the app header. */
const AUTH_ROUTE_PREFIXES = ['/login', '/register', '/forgot-password', '/auth/unlock'];

/**
 * True when `url` belongs to an authentication page (login, register, etc.).
 * Those pages keep the centered, headerless layout; every other route gets
 * the app header. Query strings are ignored.
 */
export function isAuthRoute(url: string): boolean {
  const path = url.split('?')[0] ?? '';
  return AUTH_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}
