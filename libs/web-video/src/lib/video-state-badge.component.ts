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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import type { Video, VideoState } from '@learnwren/shared-data-models';

import { VideoStatePollingService } from './polling/video-state-polling.service';
import { LwButtonDirective, LwPillComponent, type LwPillTone } from '@learnwren/web-ui';

const STUCK_THRESHOLD_MIN = 30;
const NON_TERMINAL: ReadonlyArray<Video['state']> = ['UPLOADED', 'TRANSCODING'];

@Component({
  selector: 'lib-video-state-badge',
  standalone: true,
  templateUrl: './video-state-badge.component.html',
  imports: [LwPillComponent, LwButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoStateBadgeComponent implements OnInit {
  readonly video = input.required<Video>();
  readonly stateChanged = output<VideoState>();
  /** Instructor asked to remove this video (FAILED or stalled) so the uploader can reappear. */
  readonly removeRequested = output<void>();

  private readonly polling = inject(VideoStatePollingService);
  private readonly destroyRef = inject(DestroyRef);
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
      // Stryker disable ConditionalExpression,StringLiteral: switch is exhaustive over the VideoState union ('PENDING_UPLOAD'|'UPLOADED'|'TRANSCODING'|'READY'|'FAILED'); the default arm is unreachable.
      default:
        return '';
      // Stryker restore ConditionalExpression,StringLiteral
    }
  });

  readonly tone = computed<LwPillTone>(() => {
    const v = this.current();
    if (this.isStuck(v, 'PENDING_UPLOAD')) return 'bad';
    if (this.isStuck(v, 'TRANSCODING')) return 'bad';
    switch (v.state) {
      case 'PENDING_UPLOAD':
      case 'UPLOADED':
      case 'TRANSCODING':
        return 'warn';
      case 'READY':
        return 'good';
      case 'FAILED':
        return 'bad';
      // Stryker disable ConditionalExpression,StringLiteral: switch is exhaustive over the VideoState union ('PENDING_UPLOAD'|'UPLOADED'|'TRANSCODING'|'READY'|'FAILED'); the default arm is unreachable.
      default:
        return 'default';
      // Stryker restore ConditionalExpression,StringLiteral
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
        .subscribe((next) => {
          const prevState = this.liveVideo()?.state ?? this.video().state;
          this.liveVideo.set(next);
          if (next.state !== prevState) {
            this.stateChanged.emit(next.state);
          }
        });
    }
  }

  private isStuck(v: Video, forState: Video['state']): boolean {
    if (v.state !== forState) return false;
    const ageMs = Date.now() - new Date(v.updatedAt).getTime();
    return ageMs > STUCK_THRESHOLD_MIN * 60 * 1000;
  }
}
