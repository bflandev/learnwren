import { MODULE_METADATA } from '@nestjs/common/constants';
import { afterEach, describe, expect, it } from 'vitest';

import { COVER_CONFIG, type CoverConfig } from './cover/cover.config';
import { COVER_STORAGE, type CoverStorageAdapter } from './cover/cover-storage.adapter';
import { FakeCoverStorageAdapter } from './cover/fake-cover-storage.adapter';
import { CoursesModule } from './courses.module';
import { CoursesRepository } from './courses.repository';
import { HEALTH_CONFIG } from './health/health.config';
import { MaterialsModule } from './materials/materials.module';
import { VideoModule } from './video/video.module';

interface FactoryProvider {
  provide: unknown;
  useFactory: (...args: unknown[]) => unknown;
}

function factoryFor(token: unknown): FactoryProvider['useFactory'] {
  const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CoursesModule) as FactoryProvider[];
  const found = providers.find((p) => p.provide === token);
  if (!found) throw new Error(`no provider for ${String(token)}`);
  return found.useFactory;
}

describe('CoursesModule providers', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('builds COVER_CONFIG from process.env', () => {
    process.env['LEARNWREN_COVER_BUCKET'] = 'cover-from-env';
    expect((factoryFor(COVER_CONFIG)() as CoverConfig).bucket).toBe('cover-from-env');
  });

  it('builds HEALTH_CONFIG from process.env', () => {
    process.env['LEARNWREN_STORAGE_QUOTA_GB'] = '2';
    expect(factoryFor(HEALTH_CONFIG)()).toMatchObject({ storageQuotaBytes: 2 * 1024 ** 3 });
  });

  it("wires COVER_STORAGE to the real adapter when impl is 'firebase'", () => {
    const real = { tag: 'real' } as unknown as CoverStorageAdapter;
    const cfg: CoverConfig = { bucket: 'b', publicBaseUrl: 'u', impl: 'firebase' };
    expect(factoryFor(COVER_STORAGE)(cfg, real)).toBe(real);
  });

  it("wires COVER_STORAGE to an in-memory fake on the configured bucket when impl is 'fake'", () => {
    const real = { tag: 'real' } as unknown as CoverStorageAdapter;
    const cfg: CoverConfig = { bucket: 'fake-bucket', publicBaseUrl: 'u', impl: 'fake' };
    const store = factoryFor(COVER_STORAGE)(cfg, real);
    expect(store).toBeInstanceOf(FakeCoverStorageAdapter);
    expect((store as unknown as { opts: { bucket: string } }).opts.bucket).toBe('fake-bucket');
  });

  it('exports CoursesRepository for the video and materials modules', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, CoursesModule)).toContain(CoursesRepository);
  });
});

describe('CoursesModule imports', () => {
  it('reaches VideoModule and MaterialsModule through forwardRef (the module cycles)', () => {
    const refs = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, CoursesModule) as Array<{ forwardRef?: () => unknown }>)
      .filter((i) => typeof i.forwardRef === 'function')
      .map((i) => i.forwardRef!());
    expect(refs).toEqual([VideoModule, MaterialsModule]);
  });
});
