import { Injectable, InjectionToken, inject } from '@angular/core';
import HlsImport from 'hls.js';

export interface PlayerHooks {
  onFatalError: (message: string) => void;
}

export interface PlayerHandle {
  dispose(): void;
}

export const HLS_CONSTRUCTOR = new InjectionToken<typeof HlsImport>(
  // Stryker disable next-line StringLiteral: InjectionToken description is a human-readable debug label with no runtime behavior.
  'HLS_CONSTRUCTOR',
  {
    // Stryker disable next-line StringLiteral: a token carrying its own factory resolves via that factory regardless of the providedIn string (Angular falls back to the token factory), so 'root' vs '' is behaviourally identical — equivalent mutant.
    providedIn: 'root',
    factory: () => HlsImport,
  },
);

/** True when `url` resolves to the app's own origin (the same-origin API). */
function isSameOrigin(url: string): boolean {
  try {
    // Stryker disable BlockStatement: emptying the catch makes isSameOrigin return undefined, falsy exactly like the explicit `return false`; the sole caller `if (isSameOrigin(url))` treats undefined and false identically — equivalent mutant.
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    // Stryker restore BlockStatement
    return false;
  }
}

/**
 * Map a native-HLS (Safari/iOS) `HTMLMediaElement.error.code` to a user
 * message. The native `<video>` path exposes only the coarse MediaError code,
 * not hls.js's granular `details`, so this is best-effort: distinguish a
 * network failure (offline / expired signed URL) from a decode/unknown failure
 * rather than collapsing every cause into one opaque string.
 */
function nativeUserMessageFor(code: number | undefined): string {
  switch (code) {
    case 2: // MediaError.MEDIA_ERR_NETWORK
      return 'Unable to load the video. Try again.';
    case 3: // MediaError.MEDIA_ERR_DECODE
      return 'Playback failed — try again.';
    default:
      return 'Unable to play this video.';
  }
}

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
        xhrSetup: (xhr: XMLHttpRequest, url: string) => {
          // Only attach the first-party session cookie to same-origin API
          // requests (the manifest and DRM-key endpoints, which re-authorize via
          // EnrollmentOrOwnerGuard). HLS segments are signed cross-origin GCS
          // URLs whose authorization already travels in the URL — sending the
          // cookie there is unnecessary and would force credentialed CORS on the
          // bucket.
          if (isSameOrigin(url)) {
            xhr.withCredentials = true;
          }
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
      const handler = () => hooks.onFatalError(nativeUserMessageFor(el.error?.code));
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
