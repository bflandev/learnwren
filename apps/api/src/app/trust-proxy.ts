/**
 * How many reverse-proxy hops Express trusts when it resolves the client IP
 * from X-Forwarded-For (`app.set('trust proxy', n)`). The per-IP rate limiter
 * keys on that IP, so too few hops collapses every user into the nearest
 * proxy's bucket — e.g. a self-hosted stack behind the operator's TLS proxy
 * plus the bundled nginx is 2 hops. A count (never `true`) keeps a client
 * from spoofing its IP with a forged X-Forwarded-For.
 */
export function readTrustProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env['LEARNWREN_TRUST_PROXY_HOPS']?.trim();
  if (!raw) return 1;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Refusing to start: LEARNWREN_TRUST_PROXY_HOPS must be a whole number of proxy hops, got "${raw}"`);
  }
  return Number(raw);
}
