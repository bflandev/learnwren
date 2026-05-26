import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HLS_CONSTRUCTOR, VideoPlayerService } from './video-player.service';

type FakeInst = {
  config: { xhrSetup?: (xhr: XMLHttpRequest) => void };
  on: ReturnType<typeof vi.fn>;
  loadSource: ReturnType<typeof vi.fn>;
  attachMedia: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  fire: (data: { fatal: boolean; details?: string }) => void;
};

const instances: FakeInst[] = [];
const isSupportedMock = vi.fn<() => boolean>(() => true);

type ErrorHandler = (_: unknown, data: { fatal: boolean; details?: string }) => void;
class FakeHls {
  static isSupported = isSupportedMock;
  static Events = { ERROR: 'hlsError' };
  config: FakeInst['config'];
  on: FakeInst['on'];
  loadSource: FakeInst['loadSource'];
  attachMedia: FakeInst['attachMedia'];
  destroy: FakeInst['destroy'];
  fire: FakeInst['fire'];
  constructor(config: FakeInst['config']) {
    const handlers: ErrorHandler[] = [];
    this.config = config;
    this.on = vi.fn((_e: string, h: ErrorHandler) => handlers.push(h));
    this.loadSource = vi.fn();
    this.attachMedia = vi.fn();
    this.destroy = vi.fn();
    this.fire = (data) => handlers.forEach((h) => h({}, data));
    instances.push(this);
  }
}

function videoEl(canPlay = ''): HTMLVideoElement {
  const el = document.createElement('video');
  el.canPlayType = () => canPlay as ReturnType<HTMLVideoElement['canPlayType']>;
  return el;
}

describe('VideoPlayerService', () => {
  let svc: VideoPlayerService;

  beforeEach(() => {
    instances.length = 0;
    isSupportedMock.mockReturnValue(true);
    TestBed.configureTestingModule({
      providers: [
        VideoPlayerService,
        { provide: HLS_CONSTRUCTOR, useValue: FakeHls },
      ],
    });
    svc = TestBed.inject(VideoPlayerService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses hls.js when supported — sets xhrSetup.withCredentials, loadSource, attachMedia', () => {
    const el = videoEl();
    const onFatalError = vi.fn();
    const handle = svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
    expect(instances.length).toBe(1);
    const inst = instances[0]!;
    expect(inst.loadSource).toHaveBeenCalledWith('/api/playback/manifest/v1');
    expect(inst.attachMedia).toHaveBeenCalledWith(el);
    // xhrSetup is a config callback — exercise it
    const xhr = { withCredentials: false } as XMLHttpRequest;
    (inst.config as { xhrSetup: (xhr: XMLHttpRequest) => void }).xhrSetup(xhr);
    expect(xhr.withCredentials).toBe(true);
    // dispose
    handle.dispose();
    expect(inst.destroy).toHaveBeenCalledOnce();
    expect(el.getAttribute('src')).toBeNull();
  });

  it('surfaces fatal hls errors via onFatalError with a user-friendly message', () => {
    const el = videoEl();
    const onFatalError = vi.fn();
    svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
    const inst = instances[0]!;
    inst.fire({ fatal: true, details: 'fragLoadError' });
    expect(onFatalError).toHaveBeenCalledWith('Playback interrupted — try again.');
  });

  it('ignores non-fatal hls errors', () => {
    const el = videoEl();
    const onFatalError = vi.fn();
    svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
    instances[0]!.fire({ fatal: false, details: 'bufferStalledError' });
    expect(onFatalError).not.toHaveBeenCalled();
  });

  it('maps known hls error details to user-friendly strings', () => {
    const cases: Array<[string, string]> = [
      ['manifestLoadError', 'Unable to load the video. Try again.'],
      ['manifestLoadTimeOut', 'Unable to load the video. Try again.'],
      ['levelLoadError', 'Playback interrupted — try again.'],
      ['levelLoadTimeOut', 'Playback interrupted — try again.'],
      ['fragLoadError', 'Playback interrupted — try again.'],
      ['fragLoadTimeOut', 'Playback interrupted — try again.'],
      ['keyLoadError', 'Unable to decrypt this video.'],
      ['keyLoadTimeOut', 'Unable to decrypt this video.'],
      ['somethingElse', 'Playback failed — try again.'],
    ];
    for (const [detail, expected] of cases) {
      const el = videoEl();
      const onFatalError = vi.fn();
      svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
      const inst = instances[instances.length - 1]!;
      inst.fire({ fatal: true, details: detail });
      expect(onFatalError, `for ${detail}`).toHaveBeenCalledWith(expected);
    }
  });

  it('falls back to native HLS when Hls.isSupported() is false', () => {
    isSupportedMock.mockReturnValue(false);
    const el = videoEl('maybe');
    const onFatalError = vi.fn();
    const handle = svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
    expect(el.getAttribute('src')).toBe('/api/playback/manifest/v1');
    // Fire an error — native HLS just emits a generic error event
    el.dispatchEvent(new Event('error'));
    expect(onFatalError).toHaveBeenCalledWith('Unable to play this video.');
    handle.dispose();
    expect(el.getAttribute('src')).toBeNull();
  });

  it('invokes onFatalError when no HLS path is available', () => {
    isSupportedMock.mockReturnValue(false);
    const el = videoEl(''); // canPlayType returns '' → falsy
    const onFatalError = vi.fn();
    svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
    expect(onFatalError).toHaveBeenCalledWith('Your browser does not support HLS playback.');
  });
});
