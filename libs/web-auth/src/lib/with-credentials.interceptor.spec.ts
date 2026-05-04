import { HttpRequest } from '@angular/common/http';
import { describe, expect, it, vi } from 'vitest';

import { withCredentialsInterceptor } from './with-credentials.interceptor';

describe('withCredentialsInterceptor', () => {
  it('clones the request with withCredentials: true', () => {
    const original = new HttpRequest('GET', '/api/health');
    expect(original.withCredentials).toBe(false);
    const next = vi.fn((req) => ({ subscribe: () => undefined, req } as never));

    withCredentialsInterceptor(original, next as never);

    expect(next).toHaveBeenCalledOnce();
    const passed = (next.mock.calls[0]?.[0]) as HttpRequest<unknown>;
    expect(passed.withCredentials).toBe(true);
  });
});
