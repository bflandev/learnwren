import { HttpErrorResponse } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LearnService } from './learn.service';
import { PositionSaver } from './position-saver';

function makeSaver(opts: {
  onRevoked?: () => void;
  savePosition?: (cid: string, lid: string, s: number) => Promise<{ lastWatchedSeconds: number }>;
} = {}): { saver: PositionSaver; service: { savePosition: ReturnType<typeof vi.fn> }; onRevoked: ReturnType<typeof vi.fn> } {
  const onRevoked = vi.fn(opts.onRevoked ?? (() => undefined));
  const savePosition = vi.fn(opts.savePosition ?? (async () => ({ lastWatchedSeconds: 0 })));
  const service = { savePosition } as unknown as LearnService;
  const saver = new PositionSaver({
    learn: service,
    courseId: 'c1',
    lessonId: 'l1',
    onRevoked,
    intervalMs: 100,
  });
  return { saver, service: service as never as { savePosition: ReturnType<typeof vi.fn> }, onRevoked };
}

describe('PositionSaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('does nothing until start() is called', () => {
    const { service } = makeSaver();
    vi.advanceTimersByTime(500);
    expect(service.savePosition).not.toHaveBeenCalled();
  });

  it('after start() it POSTs current time on each interval tick', async () => {
    const time = { v: 5 };
    const { saver, service } = makeSaver({ savePosition: async (_c, _l, s) => ({ lastWatchedSeconds: s }) });
    saver.start(() => time.v);

    await vi.advanceTimersByTimeAsync(100);
    expect(service.savePosition).toHaveBeenCalledWith('c1', 'l1', 5);

    time.v = 12;
    await vi.advanceTimersByTimeAsync(100);
    expect(service.savePosition).toHaveBeenLastCalledWith('c1', 'l1', 12);
  });

  it('dedupes equal integer seconds across ticks', async () => {
    const { saver, service } = makeSaver({ savePosition: async (_c, _l, s) => ({ lastWatchedSeconds: s }) });
    saver.start(() => 7.3); // floors to 7
    await vi.advanceTimersByTimeAsync(100);
    expect(service.savePosition).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(service.savePosition).toHaveBeenCalledTimes(1); // dedup
  });

  it('clamps negative time to 0', async () => {
    const { saver, service } = makeSaver({ savePosition: async (_c, _l, s) => ({ lastWatchedSeconds: s }) });
    saver.start(() => -3);
    await vi.advanceTimersByTimeAsync(100);
    expect(service.savePosition).toHaveBeenCalledWith('c1', 'l1', 0);
  });

  it('on 403 it stops the timer and invokes onRevoked', async () => {
    const err = new HttpErrorResponse({ status: 403, statusText: 'Forbidden' });
    const { saver, service, onRevoked } = makeSaver({ savePosition: async () => { throw err; } });
    saver.start(() => 10);
    await vi.advanceTimersByTimeAsync(100);
    expect(onRevoked).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(service.savePosition).toHaveBeenCalledTimes(1); // no further ticks
  });

  it('on a non-403 error it leaves lastSent unchanged so the next tick retries with the same value', async () => {
    let calls = 0;
    const { saver, service } = makeSaver({
      savePosition: async (_c, _l, _s) => {
        calls++;
        if (calls === 1) throw new HttpErrorResponse({ status: 500, statusText: 'fail' });
        return { lastWatchedSeconds: _s };
      },
    });
    saver.start(() => 9);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(service.savePosition).toHaveBeenCalledTimes(2);
    expect(service.savePosition).toHaveBeenNthCalledWith(2, 'c1', 'l1', 9);
  });

  it('flush() forces an immediate save outside the interval', async () => {
    const { saver, service } = makeSaver({ savePosition: async (_c, _l, s) => ({ lastWatchedSeconds: s }) });
    saver.start(() => 4);
    await saver.flush();
    expect(service.savePosition).toHaveBeenCalledWith('c1', 'l1', 4);
  });

  it('stop() cancels further ticks', async () => {
    const { saver, service } = makeSaver({ savePosition: async (_c, _l, s) => ({ lastWatchedSeconds: s }) });
    saver.start(() => 1);
    saver.stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(service.savePosition).not.toHaveBeenCalled();
  });

  it('flushBeacon uses navigator.sendBeacon when available and updates lastSent on success', () => {
    const beacon = vi.fn(() => true);
    Object.defineProperty(globalThis, 'navigator', {
      value: { sendBeacon: beacon },
      configurable: true,
    });
    const { saver } = makeSaver();
    saver.start(() => 50);
    saver.flushBeacon();
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0];
    expect(url).toBe('/api/learn/courses/c1/lessons/l1/position');
    expect(blob).toBeInstanceOf(Blob);
  });

  it('start() called twice does not create a second interval timer', async () => {
    const { saver, service } = makeSaver({ savePosition: async (_c, _l, s) => ({ lastWatchedSeconds: s }) });
    saver.start(() => 1);
    saver.start(() => 2); // second start reassigns getTime but the `if (this.timer) return` guard prevents a duplicate setInterval
    await vi.advanceTimersByTimeAsync(100);
    // Exactly one savePosition call per interval. If the guard were mutated to
    // `if (true) return`, no timer would be created → 0 calls. If mutated to
    // `if (false) return`, a second timer would be created → 2 calls.
    expect(service.savePosition).toHaveBeenCalledTimes(1);
    expect(service.savePosition).toHaveBeenCalledWith('c1', 'l1', 2);
  });

  describe('flushBeacon', () => {
    let originalNav: PropertyDescriptor | undefined;

    beforeEach(() => {
      originalNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    });

    afterEach(() => {
      if (originalNav) Object.defineProperty(globalThis, 'navigator', originalNav);
      else delete (globalThis as { navigator?: unknown }).navigator;
    });

    it('returns early when start() has not been called (no beacon, no fetch)', () => {
      const beacon = vi.fn(() => true);
      const fetchSpy = vi.fn();
      Object.defineProperty(globalThis, 'navigator', {
        value: { sendBeacon: beacon }, configurable: true,
      });
      Object.defineProperty(globalThis, 'fetch', { value: fetchSpy, configurable: true, writable: true });
      const { saver } = makeSaver();
      saver.flushBeacon();
      expect(beacon).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('dedupes by integer seconds — second call with same time does not fire a beacon', () => {
      const beacon = vi.fn(() => true);
      Object.defineProperty(globalThis, 'navigator', {
        value: { sendBeacon: beacon }, configurable: true,
      });
      const { saver } = makeSaver();
      saver.start(() => 50);
      saver.flushBeacon();
      saver.flushBeacon();
      expect(beacon).toHaveBeenCalledTimes(1);
    });

    it('encodes the body as a non-empty Blob with content-type application/json', () => {
      const beacon = vi.fn(() => true);
      Object.defineProperty(globalThis, 'navigator', {
        value: { sendBeacon: beacon }, configurable: true,
      });
      const { saver } = makeSaver();
      saver.start(() => 42);
      saver.flushBeacon();
      const blob = beacon.mock.calls[0][1] as Blob;
      expect(blob.type).toBe('application/json');
      // Killing the ArrayDeclaration mutant (`new Blob([body], …)` → `new Blob([], …)`):
      // the body string is `{"seconds":42}` = 14 bytes; the empty-array mutant
      // would yield a zero-byte blob.
      expect(blob.size).toBeGreaterThan(0);
      expect(blob.size).toBe(JSON.stringify({ seconds: 42 }).length);
    });

    it('does NOT update lastSent when sendBeacon returns false (next call retries the same value)', () => {
      const beacon = vi.fn(() => false);
      Object.defineProperty(globalThis, 'navigator', {
        value: { sendBeacon: beacon }, configurable: true,
      });
      const { saver } = makeSaver();
      saver.start(() => 50);
      saver.flushBeacon();
      saver.flushBeacon();
      // sendBeacon returned false both times, so dedup MUST NOT have taken effect.
      expect(beacon).toHaveBeenCalledTimes(2);
    });

    it('falls back to fetch with the keepalive POST when navigator.sendBeacon is not a function', () => {
      const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
      Object.defineProperty(globalThis, 'navigator', {
        value: { /* no sendBeacon */ }, configurable: true,
      });
      Object.defineProperty(globalThis, 'fetch', { value: fetchSpy, configurable: true, writable: true });
      const { saver } = makeSaver();
      saver.start(() => 88);
      saver.flushBeacon();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/learn/courses/c1/lessons/l1/position');
      expect(init.method).toBe('POST');
      expect(init.keepalive).toBe(true);
      expect(init.credentials).toBe('include');
      expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
      expect(init.body).toBe(JSON.stringify({ seconds: 88 }));
    });

    it('updates lastSent after fetch resolves so a subsequent call with the same seconds is deduped', async () => {
      let resolveFetch!: (r: Response) => void;
      const fetchSpy = vi.fn(() => new Promise<Response>((res) => { resolveFetch = res; }));
      Object.defineProperty(globalThis, 'navigator', {
        value: { /* no sendBeacon */ }, configurable: true,
      });
      Object.defineProperty(globalThis, 'fetch', { value: fetchSpy, configurable: true, writable: true });
      const { saver } = makeSaver();
      saver.start(() => 50);
      saver.flushBeacon();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Before fetch resolves, lastSent is unchanged — second call still fires.
      saver.flushBeacon();
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // After resolve, the .then sets lastSent=50; subsequent call with same seconds is deduped.
      resolveFetch(new Response(null, { status: 200 }));
      await Promise.resolve();
      await Promise.resolve();
      saver.flushBeacon();
      expect(fetchSpy).toHaveBeenCalledTimes(2); // no third call
    });

    it('leaves lastSent unchanged when fetch rejects (next call retries with same seconds)', async () => {
      const fetchSpy = vi.fn(() => Promise.reject(new Error('network')));
      Object.defineProperty(globalThis, 'navigator', {
        value: { /* no sendBeacon */ }, configurable: true,
      });
      Object.defineProperty(globalThis, 'fetch', { value: fetchSpy, configurable: true, writable: true });
      const { saver } = makeSaver();
      saver.start(() => 50);
      saver.flushBeacon();
      // Drain the rejection.
      await Promise.resolve();
      await Promise.resolve();
      saver.flushBeacon();
      // lastSent was NOT updated; second call also fired.
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('url-encodes courseId and lessonId path segments', () => {
      const beacon = vi.fn(() => true);
      Object.defineProperty(globalThis, 'navigator', {
        value: { sendBeacon: beacon }, configurable: true,
      });
      const onRevoked = vi.fn();
      const service = { savePosition: vi.fn() } as unknown as LearnService;
      const saver = new PositionSaver({
        learn: service,
        courseId: 'c/with slash',
        lessonId: 'l with space',
        onRevoked,
      });
      saver.start(() => 1);
      saver.flushBeacon();
      const url = beacon.mock.calls[0][0] as string;
      expect(url).toBe('/api/learn/courses/c%2Fwith%20slash/lessons/l%20with%20space/position');
    });
  });
});
