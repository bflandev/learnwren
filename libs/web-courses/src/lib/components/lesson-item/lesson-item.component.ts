import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import type { CourseId, Lesson, Video, VideoCaptionsMeta, VideoState } from '@learnwren/shared-data-models';
import {
  VideoPlayerComponent,
  VideoService,
  VideoStateBadgeComponent,
  VideoUploadComponent,
} from '@learnwren/web-video';

import { ConfirmDialogService, HlmButton, HlmInput } from '@learnwren/web-ui';

import { CaptionsPanelComponent } from '../../captions/captions-panel.component';
import { MaterialsListComponent } from '../../materials/materials-list.component';

@Component({
  selector: 'lib-lesson-item',
  standalone: true,
  imports: [FormsModule, VideoUploadComponent, VideoStateBadgeComponent, VideoPlayerComponent, MaterialsListComponent, CaptionsPanelComponent, HlmButton, HlmInput],
  templateUrl: './lesson-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LessonItemComponent {
  private readonly api = inject(VideoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly lesson = input.required<Lesson>();
  readonly courseId = input.required<CourseId>();

  readonly rename = output<string>();
  readonly delete = output<void>();
  readonly videoChanged = output<void>();
  readonly videoStateChanged = output<VideoState>();

  readonly editing = signal(false);
  readonly draftTitle = signal('');
  readonly video = signal<Video | undefined>(undefined);
  readonly captionsMeta = signal<VideoCaptionsMeta | null>(null);
  readonly videoActionError = signal<string | null>(null);

  // Memoized by string value: same videoId on a new Lesson object reference does not re-fire the effect.
  private readonly videoId = computed(() => this.lesson().videoId);

  readonly captionsTrack = computed(() => {
    const videoId = this.videoId();
    const meta = this.captionsMeta();
    if (!videoId || !meta) return null;
    return { src: `/api/playback/captions/${videoId}`, srclang: meta.language, label: meta.label };
  });

  constructor() {
    effect(() => {
      const vid = this.videoId();
      if (!vid) {
        untracked(() => this.video.set(undefined));
        return;
      }
      this.api.getVideo(vid)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (v) => this.video.set(v),
          error: () => this.video.set(undefined),
        });
    });
  }

  startEdit(): void {
    this.draftTitle.set(this.lesson().title);
    this.editing.set(true);
  }

  commit(): void {
    const next = this.draftTitle().trim();
    if (next.length === 0 || next === this.lesson().title) {
      this.editing.set(false);
      return;
    }
    this.rename.emit(next);
    this.editing.set(false);
  }

  cancel(): void {
    this.editing.set(false);
  }

  onCaptionsMeta(meta: VideoCaptionsMeta | null): void {
    this.captionsMeta.set(meta);
  }

  onVideoUploaded(): void {
    this.videoChanged.emit();
  }

  requestVideoRemoval(): void {
    void this.confirmDialog
      .confirm({
        header: 'Remove video',
        message: 'Remove this video so a new one can be uploaded? This action cannot be undone.',
        acceptLabel: 'Remove video',
        variant: 'destructive',
      })
      .then((confirmed) => this.onVideoRemovalClosed(confirmed));
  }

  /**
   * Confirmed removal of a FAILED/stalled video: the API detaches the video
   * from the lesson, so the parent refresh (via videoChanged) brings the
   * uploader back and the instructor can re-upload.
   */
  async onVideoRemovalClosed(confirmed: boolean): Promise<void> {
    if (!confirmed) return;
    const vid = this.lesson().videoId;
    if (!vid) return;
    this.videoActionError.set(null);
    try {
      await firstValueFrom(this.api.delete(vid));
      this.video.set(undefined);
      this.videoChanged.emit();
    } catch {
      this.videoActionError.set("Couldn't remove the video — please retry.");
    }
  }

  // The badge runs its own polling and only updates its local liveVideo signal,
  // so a TRANSCODING → READY transition would otherwise leave this component's
  // `video` signal stale and the @if (v.state === 'READY') branch in the
  // template would never flip to the player. Refetch here on every state
  // change so the conditional sees the new state.
  onVideoStateChanged(state: VideoState): void {
    this.videoStateChanged.emit(state);
    const vid = this.lesson().videoId;
    if (!vid) return;
    this.api.getVideo(vid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (v) => this.video.set(v),
        error: () => undefined,
      });
  }
}
