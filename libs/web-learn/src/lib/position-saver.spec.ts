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
});
