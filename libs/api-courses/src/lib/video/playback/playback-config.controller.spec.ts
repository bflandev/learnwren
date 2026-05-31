import { describe, expect, it } from 'vitest';

import type { VideoConfig } from '../video.config';
import { PlaybackConfigController } from './playback-config.controller';

function make(impl: 'real' | 'fake'): PlaybackConfigController {
  return new PlaybackConfigController({ playbackStorageImpl: impl } as VideoConfig);
}

describe('PlaybackConfigController', () => {
  it('reports fakePlayback=true when playback storage is fake', () => {
    expect(make('fake').config()).toEqual({ fakePlayback: true });
  });

  it('reports fakePlayback=false when playback storage is real', () => {
    expect(make('real').config()).toEqual({ fakePlayback: false });
  });
});
