import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HLS_CONSTRUCTOR, VideoPlayerService } from './video-player.service';

type FakeInst = {
  config: { xhrSetup?: (xhr: XMLHttpRequest, url: string) => void };
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

  it('uses hls.js when supported — scopes withCredentials to same-origin, loadSource, attachMedia', () => {
    const el = videoEl();
    const onFatalError = vi.fn();
    const handle = svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
    expect(instances.length).toBe(1);
    const inst = instances[0]!;
    expect(inst.loadSource).toHaveBeenCalledWith('/api/playback/manifest/v1');
    expect(inst.attachMedia).toHaveBeenCalledWith(el);
    // xhrSetup is a config callback — exercise both origins.
    const xhrSetup = (inst.config as { xhrSetup: (xhr: XMLHttpRequest, url: string) => void }).xhrSetup;
    // Same-origin API request (manifest / DRM key) → first-party cookie attached.
    const sameOrigin = { withCredentials: false } as XMLHttpRequest;
    xhrSetup(sameOrigin, `${window.location.origin}/api/playback/key/v1`);
    expect(sameOrigin.withCredentials).toBe(true);
    // Cross-origin signed GCS segment → cookie NOT attached.
    const crossOrigin = { withCredentials: false } as XMLHttpRequest;
    xhrSetup(crossOrigin, 'https://storage.googleapis.com/bucket/seg-1.ts?sig=abc');
    expect(crossOrigin.withCredentials).toBe(false);
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

  it('falls back to native HLS and maps a MEDIA_ERR_NETWORK to a network message', () => {
    isSupportedMock.mockReturnValue(false);
    const el = videoEl('maybe');
    const onFatalError = vi.fn();
    const handle = svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
    expect(el.getAttribute('src')).toBe('/api/playback/manifest/v1');
    // A network failure (offline / expired signed URL) → network-specific message.
    Object.defineProperty(el, 'error', { configurable: true, value: { code: 2 } });
    el.dispatchEvent(new Event('error'));
    expect(onFatalError).toHaveBeenCalledWith('Unable to load the video. Try again.');
    handle.dispose();
    expect(el.getAttribute('src')).toBeNull();
  });

  it('uses a generic native-HLS message when the MediaError code is unknown', () => {
    isSupportedMock.mockReturnValue(false);
    const el = videoEl('maybe');
    const onFatalError = vi.fn();
    svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
    // No el.error set → code undefined → generic fallback.
    el.dispatchEvent(new Event('error'));
    expect(onFatalError).toHaveBeenCalledWith('Unable to play this video.');
  });

  it('invokes onFatalError when no HLS path is available', () => {
    isSupportedMock.mockReturnValue(false);
    const el = videoEl(''); // canPlayType returns '' → falsy
    const onFatalError = vi.fn();
    svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
    expect(onFatalError).toHaveBeenCalledWith('Your browser does not support HLS playback.');
  });

  it('returns a no-op disposable on the unsupported path (callable, no throw)', () => {
    // Kills the ObjectLiteral {} and the ArrowFunction `() => undefined` mutants on
    // the final `return { dispose: () => undefined };`.
    isSupportedMock.mockReturnValue(false);
    const el = videoEl('');
    const handle = svc.attach(el, '/api/playback/manifest/v1', { onFatalError: vi.fn() });
    expect(handle).toBeTruthy();
    expect(typeof handle.dispose).toBe('function');
    expect(() => handle.dispose()).not.toThrow();
  });

  it('does NOT attach withCredentials when the segment URL is malformed (isSameOrigin catch)', () => {
    const el = videoEl();
    svc.attach(el, '/api/playback/manifest/v1', { onFatalError: vi.fn() });
    const xhrSetup = (instances[0]!.config as { xhrSetup: (xhr: XMLHttpRequest, url: string) => void }).xhrSetup;
    // A URL that makes `new URL()` throw → the catch returns false → cookie NOT
    // attached. The catch-block and its `return false` are exercised here.
    const xhr = { withCredentials: false } as XMLHttpRequest;
    xhrSetup(xhr, 'http://[malformed');
    expect(xhr.withCredentials).toBe(false);
  });

  it('hls dispose removes the src attribute and destroys the instance', () => {
    const el = videoEl();
    el.setAttribute('src', 'blob:something'); // prove removeAttribute('src') runs
    const handle = svc.attach(el, '/api/playback/manifest/v1', { onFatalError: vi.fn() });
    handle.dispose();
    expect(instances[0]!.destroy).toHaveBeenCalledOnce();
    expect(el.getAttribute('src')).toBeNull();
  });

  it('native-HLS path probes canPlayType with the apple mpegurl MIME exactly', () => {
    isSupportedMock.mockReturnValue(false);
    const el = videoEl('maybe');
    const canPlaySpy = vi.spyOn(el, 'canPlayType');
    svc.attach(el, '/api/playback/manifest/v1', { onFatalError: vi.fn() });
    // Kills the StringLiteral mutant on canPlayType('application/vnd.apple.mpegurl').
    expect(canPlaySpy).toHaveBeenCalledWith('application/vnd.apple.mpegurl');
  });

  it('maps MEDIA_ERR_DECODE (code 3) to the decode message on the native path', () => {
    isSupportedMock.mockReturnValue(false);
    const el = videoEl('maybe');
    const onFatalError = vi.fn();
    svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
    Object.defineProperty(el, 'error', { configurable: true, value: { code: 3 } });
    el.dispatchEvent(new Event('error'));
    // Kills the `case 3:` ConditionalExpression and the StringLiteral on its return.
    expect(onFatalError).toHaveBeenCalledWith('Playback failed — try again.');
  });

  it('native dispose removes the error listener (no further onFatalError after dispose)', () => {
    isSupportedMock.mockReturnValue(false);
    const el = videoEl('maybe');
    const onFatalError = vi.fn();
    const handle = svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
    el.setAttribute('src', '/api/playback/manifest/v1');
    handle.dispose();
    // After dispose the listener is gone → a fresh error event must NOT fire the
    // callback (kills the removeEventListener('error', …) StringLiteral) and the
    // src attribute is cleared.
    Object.defineProperty(el, 'error', { configurable: true, value: { code: 2 } });
    el.dispatchEvent(new Event('error'));
    expect(onFatalError).not.toHaveBeenCalled();
    expect(el.getAttribute('src')).toBeNull();
  });
});

describe('HLS_CONSTRUCTOR injection token (default factory)', () => {
  it('resolves to the real Hls implementation when no override is provided', () => {
    TestBed.configureTestingModule({ providers: [VideoPlayerService] });
    // No { provide: HLS_CONSTRUCTOR } override → the token's default factory runs.
    const Hls = TestBed.inject(HLS_CONSTRUCTOR);
    // Kills the providedIn/factory ObjectLiteral and the factory ArrowFunction:
    // a `() => undefined` factory or a {} config would not yield the Hls class.
    expect(Hls).toBeDefined();
    expect(typeof Hls).toBe('function');
    expect(typeof Hls.isSupported).toBe('function');
  });
});
