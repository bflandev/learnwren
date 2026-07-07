export interface ThrottleTier {
  name: string;
  ttl: number;
  limit: number;
}

const DEFAULT_BURST_LIMIT = 100;
const DEFAULT_SUSTAINED_LIMIT = 1000;

/** A positive-integer env override, or the production default. */
function limitFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Per-IP rate-limit tiers. Production defaults; the env overrides exist for
 * e2e runs, where every parallel Playwright worker shares 127.0.0.1 and a
 * fast suite bursts past the production limits (CI-observed 429 flake on
 * /auth/register).
 */
export function resolveThrottleTiers(env: NodeJS.ProcessEnv): ThrottleTier[] {
  return [
    {
      name: 'burst',
      ttl: 10_000,
      limit: limitFromEnv(env['LEARNWREN_THROTTLE_BURST_LIMIT'], DEFAULT_BURST_LIMIT),
    },
    {
      name: 'sustained',
      ttl: 60_000,
      limit: limitFromEnv(env['LEARNWREN_THROTTLE_SUSTAINED_LIMIT'], DEFAULT_SUSTAINED_LIMIT),
    },
  ];
}
