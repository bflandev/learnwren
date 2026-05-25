import {
  AfterViewInit,
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

import { LwButtonDirective } from '@learnwren/web-ui';
import { VideoPlayerService, type PlayerHandle } from './video-player.service';

@Component({
  selector: 'lib-video-player',
  standalone: true,
  imports: [LwButtonDirective],
  templateUrl: './video-player.component.html',
})
export class VideoPlayerComponent implements AfterViewInit, OnDestroy {
  readonly videoId = input.required<VideoId>();

  @ViewChild('playerEl', { static: true })
  playerEl!: ElementRef<HTMLVideoElement>;

  /** Native <video> event proxies. Consumers may ignore all of them. */
  @Output() readonly metadata = new EventEmitter<void>();
  @Output() readonly played = new EventEmitter<void>();
  @Output() readonly paused = new EventEmitter<void>();
  @Output() readonly videoEnded = new EventEmitter<void>();

  readonly error = signal<string | null>(null);
  private handle: PlayerHandle | null = null;
  private readonly playerSvc = inject(VideoPlayerService);
  private listenersAttached = false;
  private readonly onMetadata = (): void => this.metadata.emit();
  private readonly onPlay = (): void => this.played.emit();
  private readonly onPause = (): void => this.paused.emit();
  private readonly onEnded = (): void => this.videoEnded.emit();

  ngAfterViewInit(): void {
    this.attachListeners();
    this.mount();
  }

  ngOnDestroy(): void {
    this.detachListeners();
    this.handle?.dispose();
    this.handle = null;
  }

  retry(): void {
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
