import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  Output,
  ViewChild,
  inject,
  input,
  signal,
} from '@angular/core';

import type { VideoId } from '@learnwren/shared-data-models';

import { HlmButton } from '@learnwren/web-ui';
import { PlaybackConfigService } from '../playback-config.service';
import { VideoPlayerService, type PlayerHandle } from './video-player.service';

@Component({
  selector: 'lib-video-player',
  standalone: true,
  imports: [HlmButton],
  templateUrl: './video-player.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoPlayerComponent implements AfterViewInit, OnDestroy {
  readonly videoId = input.required<VideoId>();
  readonly captions = input<{ src: string; srclang: string; label: string } | null>(null);

  @ViewChild('playerEl', { static: true })
  playerEl!: ElementRef<HTMLVideoElement>;

  /** Native <video> event proxies. Consumers may ignore all of them. */
  @Output() readonly metadata = new EventEmitter<void>();
  @Output() readonly played = new EventEmitter<void>();
  @Output() readonly paused = new EventEmitter<void>();
  @Output() readonly videoEnded = new EventEmitter<void>();

  readonly error = signal<string | null>(null);
  /**
   * True in local/dev fake-playback mode: there are no decryptable HLS
   * segments, so we skip mounting hls.js (which would flood the console with
   * failed segment fetches) and show a placeholder instead.
   */
  readonly devPlaceholder = signal(false);
  private handle: PlayerHandle | null = null;
  private readonly playerSvc = inject(VideoPlayerService);
  private readonly playbackConfig = inject(PlaybackConfigService);
  private listenersAttached = false;
  private readonly onMetadata = (): void => this.metadata.emit();
  private readonly onPlay = (): void => this.played.emit();
  private readonly onPause = (): void => this.paused.emit();
  private readonly onEnded = (): void => this.videoEnded.emit();

  ngAfterViewInit(): void {
    // Always attach native <video> listeners — the lesson page's resume/
    // position-saving machinery dispatches events on the element regardless of
    // whether hls.js is mounted. Only the hls.js mount (and its segment/key
    // fetches) is gated behind real playback mode.
    this.attachListeners();
    if (this.playbackConfig.isFakePlayback()) {
      this.devPlaceholder.set(true);
      return;
    }
    this.mount();
  }

  ngOnDestroy(): void {
    this.detachListeners();
    this.handle?.dispose();
    this.handle = null;
  }

  retry(): void {
    if (this.devPlaceholder()) return;
    // Stryker disable next-line OptionalChaining: unreachable null. retry() returns early in fake-playback mode (devPlaceholder guard above), so it runs only in real mode where mount() has already set a non-null handle; the `?.` can never short-circuit here. Equivalent mutant.
    this.handle?.dispose();
    this.handle = null;
    this.error.set(null);
    this.mount();
  }

  currentTime(): number {
    return this.playerEl.nativeElement.currentTime;
  }

  seekTo(seconds: number): void {
    this.playerEl.nativeElement.currentTime = seconds;
  }

  private mount(): void {
    const url = `/api/playback/manifest/${this.videoId()}`;
    this.handle = this.playerSvc.attach(this.playerEl.nativeElement, url, {
      onFatalError: (message: string) => this.error.set(message),
    });
  }

  private attachListeners(): void {
    if (this.listenersAttached) return;
    const el = this.playerEl.nativeElement;
    el.addEventListener('loadedmetadata', this.onMetadata);
    el.addEventListener('play', this.onPlay);
    el.addEventListener('pause', this.onPause);
    el.addEventListener('ended', this.onEnded);
    this.listenersAttached = true;
  }

  private detachListeners(): void {
    if (!this.listenersAttached) return;
    const el = this.playerEl.nativeElement;
    el.removeEventListener('loadedmetadata', this.onMetadata);
    el.removeEventListener('play', this.onPlay);
    el.removeEventListener('pause', this.onPause);
    el.removeEventListener('ended', this.onEnded);
    this.listenersAttached = false;
  }
}
