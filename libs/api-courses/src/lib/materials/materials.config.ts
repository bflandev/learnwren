export const MATERIALS_CONFIG = Symbol.for('learnwren.api-courses.materials.config');

export interface MaterialsConfig {
  materialsBucket: string;
  storageImpl: 'real' | 'fake';
  uploadUrlTtlSec: number;
  downloadUrlTtlSec: number;
}

function readRequired(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name];
  if (!v) throw new Error(`${name} env var is required.`);
  return v;
}

function readPositiveNumber(env: NodeJS.ProcessEnv, name: string, dflt: string): number {
  const raw = env[name] ?? dflt;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}".`);
  }
  return n;
}

export function readMaterialsConfigFromEnv(env: NodeJS.ProcessEnv): MaterialsConfig {
  // Outside production the materials stack defaults to its credential-free fake
  // mode, so `nx serve` and the e2e suite boot with no GCP project or buckets.
  const isProduction = env['NODE_ENV'] === 'production';

  const materialsBucket = isProduction
    ? readRequired(env, 'LEARNWREN_MATERIALS_BUCKET')
    : (env['LEARNWREN_MATERIALS_BUCKET'] ?? 'learnwren-dev-materials');

  const fakeRaw = env['LEARNWREN_MATERIALS_STORAGE_FAKE'];
  let storageImpl: 'real' | 'fake';
  if (fakeRaw === 'true') {
    storageImpl = 'fake';
  } else if (fakeRaw === undefined) {
    storageImpl = isProduction ? 'real' : 'fake';
  } else {
    storageImpl = 'real';
  }
  if (storageImpl === 'fake' && isProduction) {
    throw new Error(
      'LEARNWREN_MATERIALS_STORAGE_FAKE=true is rejected when NODE_ENV=production.',
    );
  }

  return {
    materialsBucket,
    storageImpl,
    uploadUrlTtlSec: readPositiveNumber(env, 'LEARNWREN_MATERIALS_UPLOAD_URL_TTL_SEC', '900'),
    downloadUrlTtlSec: readPositiveNumber(env, 'LEARNWREN_MATERIALS_DOWNLOAD_URL_TTL_SEC', '900'),
  };
}
