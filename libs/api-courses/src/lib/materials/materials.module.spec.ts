import { MODULE_METADATA } from '@nestjs/common/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CoursesModule } from '../courses.module';
import { MATERIALS_CONFIG, type MaterialsConfig } from './materials.config';
import { MaterialsModule } from './materials.module';

describe('MaterialsModule providers', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('builds MATERIALS_CONFIG from process.env', () => {
    process.env['LEARNWREN_MATERIALS_BUCKET'] = 'materials-from-env';
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, MaterialsModule) as Array<{
      provide?: unknown;
      useFactory?: () => MaterialsConfig;
    }>;
    const factory = providers.find((p) => p.provide === MATERIALS_CONFIG)!.useFactory!;
    expect(factory().materialsBucket).toBe('materials-from-env');
  });
});

describe('MaterialsModule proxy controller gate (evaluated at import)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  const S3_ENV = {
    LEARNWREN_OBJECT_STORAGE: 's3',
    LEARNWREN_S3_ENDPOINT: 'http://rustfs:9000',
    LEARNWREN_S3_ACCESS_KEY: 'a',
    LEARNWREN_S3_SECRET_KEY: 's',
  };

  async function loadWith(env: Record<string, string | undefined>) {
    vi.resetModules();
    process.env = { ...saved };
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    const mod = await import('./materials.module');
    const { MaterialsProxyController } = await import('./webhook/materials-proxy.controller');
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, mod.MaterialsModule) as unknown[];
    return controllers.includes(MaterialsProxyController);
  }

  it('mounts the proxy outside production when fake storage is on', async () => {
    expect(
      await loadWith({ NODE_ENV: 'test', LEARNWREN_MATERIALS_STORAGE_FAKE: 'true', LEARNWREN_OBJECT_STORAGE: 'gcs' }),
    ).toBe(true);
  });

  it('does not mount the proxy for real GCS storage', async () => {
    expect(
      await loadWith({ NODE_ENV: 'test', LEARNWREN_MATERIALS_STORAGE_FAKE: undefined, LEARNWREN_OBJECT_STORAGE: 'gcs' }),
    ).toBe(false);
  });

  it('mounts the proxy in production S3 mode (the store is never browser-facing)', async () => {
    expect(await loadWith({ NODE_ENV: 'production', LEARNWREN_MATERIALS_STORAGE_FAKE: 'false', ...S3_ENV })).toBe(true);
  });

  it('does not mount the proxy in production GCS mode', async () => {
    expect(
      await loadWith({ NODE_ENV: 'production', LEARNWREN_MATERIALS_STORAGE_FAKE: undefined, LEARNWREN_OBJECT_STORAGE: 'gcs' }),
    ).toBe(false);
  });

  it('refuses to load when fake materials storage is configured in production', async () => {
    await expect(
      loadWith({ NODE_ENV: 'production', LEARNWREN_MATERIALS_STORAGE_FAKE: 'true' }),
    ).rejects.toThrow(
      'Refusing to start: LEARNWREN_MATERIALS_STORAGE_FAKE=true is incompatible with NODE_ENV=production',
    );
  });
});

describe('MaterialsModule imports', () => {
  it('reaches CoursesModule through forwardRef (the module cycle)', () => {
    const refs = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, MaterialsModule) as Array<{ forwardRef?: () => unknown }>)
      .filter((i) => typeof i.forwardRef === 'function')
      .map((i) => i.forwardRef!());
    expect(refs).toEqual([CoursesModule]);
  });
});
