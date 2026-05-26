import { Injectable, InjectionToken, inject } from '@angular/core';
import HlsImport from 'hls.js';

export interface PlayerHooks {
  onFatalError: (message: string) => void;
}

export interface PlayerHandle {
  dispose(): void;
}

export const HLS_CONSTRUCTOR = new InjectionToken<typeof HlsImport>('HLS_CONSTRUCTOR', {
  providedIn: 'root',
  factory: () => HlsImport,
});

function userMessageFor(details: string | undefined): string {
  switch (details) {
    case 'manifestLoadError':
    case 'manifestLoadTimeOut':
      return 'Unable to load the video. Try again.';
    case 'levelLoadError':
    case 'levelLoadTimeOut':
    case 'fragLoadError':
    case 'fragLoadTimeOut':
      return 'Playback interrupted — try again.';
    case 'keyLoadError':
    case 'keyLoadTimeOut':
      return 'Unable to decrypt this video.';
    default:
      return 'Playback failed — try again.';
  }
}

@Injectable({ providedIn: 'root' })
export class VideoPlayerService {
  private readonly Hls = inject(HLS_CONSTRUCTOR);

  attach(
    el: HTMLVideoElement,
    manifestUrl: string,
    hooks: PlayerHooks,
  ): PlayerHandle {
    const Hls = this.Hls;
    if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: (xhr: XMLHttpRequest) => {
          xhr.withCredentials = true;
        },
      });
      hls.on(Hls.Events.ERROR, (_: unknown, data: { fatal: boolean; details?: string }) => {
        if (data.fatal) hooks.onFatalError(userMessageFor(data.details));
      });
      hls.loadSource(manifestUrl);
      hls.attachMedia(el);
      return {
        dispose: () => {
          hls.destroy();
          el.removeAttribute('src');
          el.load();
        },
      };
    }

    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = manifestUrl;
      const handler = () => hooks.onFatalError('Unable to play this video.');
      el.addEventListener('error', handler);
      return {
        dispose: () => {
          el.removeEventListener('error', handler);
          el.removeAttribute('src');
          el.load();
        },
      };
    }

    hooks.onFatalError('Your browser does not support HLS playback.');
    return { dispose: () => undefined };
  }
}
