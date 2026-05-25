import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import type { CourseId, Lesson, Video, VideoState } from '@learnwren/shared-data-models';
import {
  VideoPlayerComponent,
  VideoService,
  VideoStateBadgeComponent,
  VideoUploadComponent,
} from '@learnwren/web-video';

import { LwButtonDirective, LwInputDirective } from '@learnwren/web-ui';

import { MaterialsListComponent } from '../../materials/materials-list.component';

@Component({
  selector: 'lib-lesson-item',
  standalone: true,
  imports: [FormsModule, VideoUploadComponent, VideoStateBadgeComponent, VideoPlayerComponent, MaterialsListComponent, LwButtonDirective, LwInputDirective],
  templateUrl: './lesson-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LessonItemComponent {
  private readonly api = inject(VideoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly lesson = input.required<Lesson>();
  readonly courseId = input.required<CourseId>();

  readonly rename = output<string>();
  readonly delete = output<void>();
  readonly videoChanged = output<void>();
  readonly videoStateChanged = output<VideoState>();

  readonly editing = signal(false);
  readonly draftTitle = signal('');
  readonly video = signal<Video | undefined>(undefined);

  constructor() {
    effect(() => {
      const vid = this.lesson().videoId;
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

  onVideoUploaded(): void {
    this.videoChanged.emit();
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
