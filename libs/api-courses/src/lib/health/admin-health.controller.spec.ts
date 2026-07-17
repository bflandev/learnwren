import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

import { AdminRoleGuard, FirebaseSessionGuard } from '@learnwren/api-auth';

import { AdminHealthController } from './admin-health.controller';

describe('AdminHealthController', () => {
  it('delegates to AdminHealthService.getReport', async () => {
    const report = { services: [], stats: {}, alerts: [], generatedAt: 'now' };
    const service = { getReport: vi.fn().mockResolvedValue(report) };
    const controller = new AdminHealthController(service as never);
    await expect(controller.getReport()).resolves.toBe(report);
  });

  it('is guarded by FirebaseSessionGuard and AdminRoleGuard', () => {
    const guards = Reflect.getMetadata('__guards__', AdminHealthController) as unknown[];
    expect(guards).toEqual([FirebaseSessionGuard, AdminRoleGuard]);
  });
});
