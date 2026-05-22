import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
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

  readonly error = signal<string | null>(null);
  private handle: PlayerHandle | null = null;
  private readonly playerSvc = inject(VideoPlayerService);

  ngAfterViewInit(): void {
    this.mount();
  }

  ngOnDestroy(): void {
    this.handle?.dispose();
    this.handle = null;
  }

  retry(): void {
    this.handle?.dispose();
    this.handle = null;
    this.error.set(null);
    this.mount();
  }

  private mount(): void {
    const url = `/api/playback/manifest/${this.videoId()}`;
    this.handle = this.playerSvc.attach(this.playerEl.nativeElement, url, {
      onFatalError: (message: string) => this.error.set(message),
    });
  }
}
