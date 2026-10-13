import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { interval, map } from 'rxjs';

import type { Video, VideoState } from '@learnwren/shared-data-models';

import { VideoStatePollingService } from './polling/video-state-polling.service';
import { HlmBadge, HlmButton, type BadgeVariant } from '@learnwren/web-ui';

const STUCK_THRESHOLD_MIN = 30;
const CLOCK_TICK_MS = 60_000;
const NON_TERMINAL: ReadonlyArray<Video['state']> = ['UPLOADED', 'TRANSCODING'];

@Component({
  selector: 'lib-video-state-badge',
  standalone: true,
  templateUrl: './video-state-badge.component.html',
  imports: [HlmBadge, HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoStateBadgeComponent implements OnInit {
  readonly video = input.required<Video>();
  readonly stateChanged = output<VideoState>();
  /** Instructor asked to remove this video (FAILED or stalled) so the uploader can reappear. */
  readonly removeRequested = output<void>();

  private readonly polling = inject(VideoStatePollingService);
  private readonly destroyRef = inject(DestroyRef);
  /**
   * A ticking clock signal: isStuck() reads it, so "stalled" (and the remove
   * control) appear on their own. Date.now() alone is not reactive, and
   * polling stops right at the stall threshold, so nothing else re-evaluates.
   */
  private readonly now = toSignal(interval(CLOCK_TICK_MS).pipe(map(() => Date.now())), {
    initialValue: Date.now(),
  });
  private readonly liveVideo = signal<Video | null>(null);

  private readonly current = computed(() => this.liveVideo() ?? this.video());

  readonly label = computed(() => {
    const v = this.current();
    if (this.isStuck(v, 'PENDING_UPLOAD')) return 'Upload may have stalled — retry?';
    if (this.isStuck(v, 'TRANSCODING')) return 'Transcoding may have stalled — delete and re-upload?';
    switch (v.state) {
      case 'PENDING_UPLOAD':
      case 'UPLOADED':
        return 'Uploaded — preparing…';
      case 'TRANSCODING':
        return 'Processing video…';
      case 'READY':
        return 'Ready to publish';
      case 'FAILED':
        return 'Transcoding failed — delete and re-upload';
      default: // a state newer than this client (server added one)
        return '';
    }
  });

  readonly variant = computed<BadgeVariant>(() => {
    const v = this.current();
    if (this.isStuck(v, 'PENDING_UPLOAD')) return 'destructive';
    if (this.isStuck(v, 'TRANSCODING')) return 'destructive';
    switch (v.state) {
      case 'PENDING_UPLOAD':
      case 'UPLOADED':
      case 'TRANSCODING':
        return 'warning';
      case 'READY':
        return 'success';
      case 'FAILED':
        return 'destructive';
      default:
        return 'default';
    }
  });

  readonly canRetry = computed(() => this.isStuck(this.current(), 'PENDING_UPLOAD'));
  /**
   * The badge copy promises "retry" / "delete and re-upload" for these states,
   * so a matching control must exist: FAILED is a terminal dead end, and a
   * stalled PENDING_UPLOAD/TRANSCODING never resolves on its own.
   */
  readonly canRemove = computed(() => {
    const v = this.current();
    return (
      v.state === 'FAILED' || this.isStuck(v, 'PENDING_UPLOAD') || this.isStuck(v, 'TRANSCODING')
    );
  });
  readonly showSpinner = computed(
    () => NON_TERMINAL.includes(this.current().state) && !this.canRetry(),
  );

  ngOnInit(): void {
    const v = this.video();
    if (NON_TERMINAL.includes(v.state)) {
      this.polling
        .poll(v.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (next) => {
            const prevState = this.liveVideo()?.state ?? this.video().state;
            this.liveVideo.set(next);
            if (next.state !== prevState) {
              this.stateChanged.emit(next.state);
            }
          },
          // Polling already retried; keep the last known state. The stuck
          // threshold surfaces the remove control, and a reload re-polls.
          error: () => undefined,
        });
    }
  }

  private isStuck(v: Video, forState: Video['state']): boolean {
    if (v.state !== forState) return false;
    const ageMs = this.now() - new Date(v.updatedAt).getTime();
    return ageMs > STUCK_THRESHOLD_MIN * 60 * 1000;
  }
}
