import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    controller = moduleRef.get(AppController);
  });

  describe('getHealth', () => {
    it('returns status ok and a non-empty version string', () => {
      const result = controller.getHealth();
      expect(result.status).toBe('ok');
      expect(typeof result.version).toBe('string');
      expect(result.version.length).toBeGreaterThan(0);
      expect(typeof result.serverTime).toBe('string');
      expect(() => new Date(result.serverTime).toISOString()).not.toThrow();
    });

    it('reports version 0.0.0 when npm_package_version is unset', () => {
      vi.stubEnv('npm_package_version', undefined);
      try {
        expect(controller.getHealth().version).toBe('0.0.0');
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('reports npm_package_version when set', () => {
      vi.stubEnv('npm_package_version', '9.9.9');
      try {
        expect(controller.getHealth().version).toBe('9.9.9');
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });
});
