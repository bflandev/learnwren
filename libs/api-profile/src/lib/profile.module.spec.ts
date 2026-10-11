import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakePictureStorageAdapter } from './picture/fake-picture-storage.adapter';
import { PICTURE_CONFIG, type PictureConfig } from './picture/picture.config';
import { PICTURE_STORAGE, type PictureStorageAdapter } from './picture/picture-storage.adapter';
import { ProfileModule } from './profile.module';

interface FactoryProvider {
  provide: unknown;
  useFactory: (...args: unknown[]) => unknown;
}

function factoryFor(token: symbol | string): FactoryProvider['useFactory'] {
  const providers = Reflect.getMetadata('providers', ProfileModule) as FactoryProvider[];
  const provider = providers.find((p) => p.provide === token);
  if (!provider) throw new Error(`no provider for ${String(token)}`);
  return provider.useFactory;
}

const config = (impl: PictureConfig['impl']): PictureConfig => ({ bucket: 'b', publicBaseUrl: 'https://cdn.test/b', impl });

describe('ProfileModule providers', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads PICTURE_CONFIG from process.env', () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LEARNWREN_PICTURE_BUCKET', 'pics');
    vi.stubEnv('LEARNWREN_PICTURE_PUBLIC_BASE_URL', 'https://cdn.test/pics');
    vi.stubEnv('LEARNWREN_PICTURE_STORAGE', 'firebase');

    // Act
    const cfg = factoryFor(PICTURE_CONFIG)();

    // Assert
    expect(cfg).toEqual({ bucket: 'pics', publicBaseUrl: 'https://cdn.test/pics', impl: 'firebase' });
  });

  it('uses the real picture store when impl is firebase', () => {
    const real = {} as PictureStorageAdapter;
    expect(factoryFor(PICTURE_STORAGE)(config('firebase'), real)).toBe(real);
  });

  it('uses the in-memory fake when impl is fake', () => {
    const real = {} as PictureStorageAdapter;
    expect(factoryFor(PICTURE_STORAGE)(config('fake'), real)).toBeInstanceOf(FakePictureStorageAdapter);
  });
});
