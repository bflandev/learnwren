import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { VideoId } from '@learnwren/shared-data-models';

import { VideoPlayerComponent } from './video-player.component';
import { VideoPlayerService, type PlayerHandle } from './video-player.service';

interface StubService {
  handle: PlayerHandle & { dispose: ReturnType<typeof vi.fn> };
  attach: ReturnType<typeof vi.fn>;
  capturedHooks: { onFatalError: (msg: string) => void };
}

function makeStubService(): StubService {
  const handle = { dispose: vi.fn() };
  const stub: StubService = {
    handle,
    attach: vi.fn(),
    capturedHooks: { onFatalError: () => undefined },
  };
  stub.attach.mockImplementation((_el: HTMLVideoElement, _url: string, hooks) => {
    stub.capturedHooks = hooks;
    return handle;
  });
  return stub;
}

async function bootstrap(): Promise<{
  fixture: ComponentFixture<VideoPlayerComponent>;
  stub: StubService;
}> {
  const stub = makeStubService();
  TestBed.configureTestingModule({
    imports: [VideoPlayerComponent],
    providers: [{ provide: VideoPlayerService, useValue: stub }],
  });
  const fixture = TestBed.createComponent(VideoPlayerComponent);
  fixture.componentRef.setInput('videoId', 'v1' as VideoId);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, stub };
}

describe('VideoPlayerComponent', () => {
  it('attaches the service to the video element with the manifest URL', async () => {
    const { stub } = await bootstrap();
    expect(stub.attach).toHaveBeenCalledOnce();
    const args = stub.attach.mock.calls[0]!;
    // First arg is the video element
    expect(args[0]).toBeInstanceOf(HTMLVideoElement);
    // Second arg is the manifest URL
    expect(args[1]).toBe('/api/playback/manifest/v1');
  });

  it('disposes the handle on destroy', async () => {
    const { fixture, stub } = await bootstrap();
    fixture.destroy();
    expect(stub.handle.dispose).toHaveBeenCalledOnce();
  });

  it('renders an error and Try again button on fatal error', async () => {
    const { fixture, stub } = await bootstrap();
    stub.capturedHooks.onFatalError('Playback interrupted — try again.');
    fixture.detectChanges();
    const alert = fixture.nativeElement.querySelector(
      '[data-testid="video-player-error"]',
    );
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('Playback interrupted');
    const retry = fixture.nativeElement.querySelector(
      '[data-testid="video-player-retry"]',
    );
    expect(retry).not.toBeNull();
  });

  it('retry disposes the handle, clears error, and re-attaches', async () => {
    const { fixture, stub } = await bootstrap();
    stub.capturedHooks.onFatalError('Playback interrupted — try again.');
    fixture.detectChanges();
    const retry = fixture.nativeElement.querySelector(
      '[data-testid="video-player-retry"]',
    ) as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();
    expect(stub.handle.dispose).toHaveBeenCalledOnce();
    expect(stub.attach).toHaveBeenCalledTimes(2);
    expect(
      fixture.nativeElement.querySelector('[data-testid="video-player-error"]'),
    ).toBeNull();
  });

  it('does not render the error region while no error is set', async () => {
    const { fixture } = await bootstrap();
    expect(
      fixture.nativeElement.querySelector('[data-testid="video-player-error"]'),
    ).toBeNull();
  });

  it('passes onFatalError hook that updates the error signal', async () => {
    const { fixture, stub } = await bootstrap();
    // Hook callback should be captured via the attach call
    expect(stub.capturedHooks.onFatalError).toBeTypeOf('function');
    stub.capturedHooks.onFatalError('Test error message');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Test error message');
  });
});

function harness(): {
  fixture: ComponentFixture<VideoPlayerComponent>;
  el: HTMLVideoElement;
} {
  const playerSvcStub = { attach: vi.fn(() => ({ dispose: vi.fn() })) };
  TestBed.configureTestingModule({
    imports: [VideoPlayerComponent],
    providers: [
      provideHttpClient(),
      { provide: VideoPlayerService, useValue: playerSvcStub },
    ],
  });
  const fixture = TestBed.createComponent(VideoPlayerComponent);
  fixture.componentRef.setInput('videoId', 'vid-1' as VideoId);
  fixture.detectChanges();
  const el = fixture.componentInstance.playerEl.nativeElement;
  return { fixture, el };
}

describe('VideoPlayerComponent — Slice C event surface', () => {
  it('emits (metadata) on loadedmetadata', () => {
    const { fixture, el } = harness();
    const spy = vi.fn();
    fixture.componentInstance.metadata.subscribe(spy);
    el.dispatchEvent(new Event('loadedmetadata'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('emits (played) on play', () => {
    const { fixture, el } = harness();
    const spy = vi.fn();
    fixture.componentInstance.played.subscribe(spy);
    el.dispatchEvent(new Event('play'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('emits (paused) on pause', () => {
    const { fixture, el } = harness();
    const spy = vi.fn();
    fixture.componentInstance.paused.subscribe(spy);
    el.dispatchEvent(new Event('pause'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('emits (ended) on ended', () => {
    const { fixture, el } = harness();
    const spy = vi.fn();
    fixture.componentInstance.ended.subscribe(spy);
    el.dispatchEvent(new Event('ended'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('currentTime() proxies the underlying element', () => {
    const { fixture, el } = harness();
    Object.defineProperty(el, 'currentTime', {
      value: 17,
      configurable: true,
      writable: true,
    });
    expect(fixture.componentInstance.currentTime()).toBe(17);
  });

  it('seekTo(s) sets the underlying element currentTime', () => {
    const { fixture, el } = harness();
    let stored = 0;
    Object.defineProperty(el, 'currentTime', {
      get: () => stored,
      set: (v) => {
        stored = v;
      },
      configurable: true,
    });
    fixture.componentInstance.seekTo(33);
    expect(stored).toBe(33);
  });
});
