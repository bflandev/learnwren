import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { PlaybackConfig } from '@learnwren/shared-data-models';

/**
 * Holds the server's playback mode, fetched once at app bootstrap (via an
 * APP_INITIALIZER calling `load()`). `isFakePlayback()` is then a synchronous
 * read used by the player to decide whether to mount hls.js or show a dev
 * placeholder. Fails safe to `false` (real playback) on any fetch error.
 */
@Injectable({ providedIn: 'root' })
export class PlaybackConfigService {
  private readonly http = inject(HttpClient);
  private fake = false;

  async load(): Promise<void> {
    try {
      const cfg = await firstValueFrom(
        this.http.get<PlaybackConfig>('/api/playback/config'),
      );
      this.fake = cfg.fakePlayback === true;
    } catch {
      // Non-fatal: a failed probe leaves the player in normal (real) mode.
      this.fake = false;
    }
  }

  isFakePlayback(): boolean {
    return this.fake;
  }
}
