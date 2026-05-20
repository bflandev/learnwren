import {
  Component,
  DestroyRef,
  EventEmitter,
  Output,
  effect,
  inject,
  input,
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

@Component({
  selector: 'lib-lesson-item',
  standalone: true,
  imports: [FormsModule, VideoUploadComponent, VideoStateBadgeComponent, VideoPlayerComponent],
  templateUrl: './lesson-item.component.html',
})
export class LessonItemComponent {
  private readonly api = inject(VideoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly lesson = input.required<Lesson>();
  readonly courseId = input.required<CourseId>();

  @Output() readonly rename = new EventEmitter<string>();
  @Output() readonly delete = new EventEmitter<void>();
  @Output() readonly videoChanged = new EventEmitter<void>();
  @Output() readonly videoStateChanged = new EventEmitter<VideoState>();

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
}
