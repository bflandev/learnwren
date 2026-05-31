import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PlaybackConfigService } from './playback-config.service';

describe('PlaybackConfigService', () => {
  let svc: PlaybackConfigService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PlaybackConfigService, provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(PlaybackConfigService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('defaults to real (false) before load', () => {
    expect(svc.isFakePlayback()).toBe(false);
  });

  it('reports fake after load when the server is in fake mode', async () => {
    const p = svc.load();
    http.expectOne('/api/playback/config').flush({ fakePlayback: true });
    await p;
    expect(svc.isFakePlayback()).toBe(true);
  });

  it('reports real after load when the server is in real mode', async () => {
    const p = svc.load();
    http.expectOne('/api/playback/config').flush({ fakePlayback: false });
    await p;
    expect(svc.isFakePlayback()).toBe(false);
  });

  it('fails safe to false when the probe errors', async () => {
    const p = svc.load();
    http.expectOne('/api/playback/config').flush('nope', { status: 500, statusText: 'Server Error' });
    await p;
    expect(svc.isFakePlayback()).toBe(false);
  });
});
