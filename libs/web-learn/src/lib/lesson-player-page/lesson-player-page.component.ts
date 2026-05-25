import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import type { ISODateString, LessonView } from '@learnwren/shared-data-models';
import { VideoPlayerComponent } from '@learnwren/web-video';

import { LearnService } from '../learn.service';

type PageState = 'LOADING' | 'READY' | 'PROCESSING' | 'NOT_ENROLLED' | 'NOT_FOUND' | 'LOAD_ERROR';

@Component({
  selector: 'lib-lesson-player-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VideoPlayerComponent, DatePipe],
  templateUrl: './lesson-player-page.component.html',
})
export class LessonPlayerPageComponent implements OnInit {
  private readonly learn = inject(LearnService);

  readonly courseId = input.required<string>();
  readonly lessonId = input.required<string>();

  readonly state = signal<PageState>('LOADING');
  readonly view = signal<LessonView | null>(null);

  readonly completedAt = computed<ISODateString | null>(
    () => this.view()?.progress?.completedAt ?? null,
  );
  readonly isOwnerPreview = computed<boolean>(() => this.view()?.progress === null);
  readonly markBusy = signal<boolean>(false);
  readonly markError = signal<null | 'revoked' | 'other'>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.state.set('LOADING');
    try {
      const view = await this.learn.getLessonView(this.courseId(), this.lessonId());
      this.view.set(view);
      const v = view.lesson;
      if (v.videoId && v.videoState === 'READY') {
        this.state.set('READY');
      } else {
        this.state.set('PROCESSING');
      }
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 403) {
          this.state.set('NOT_ENROLLED');
          return;
        }
        if (err.status === 404) {
          this.state.set('NOT_FOUND');
          return;
        }
      }
      this.state.set('LOAD_ERROR');
    }
  }

  retry(): void {
    void this.load();
  }

  async onMarkComplete(): Promise<void> {
    this.markBusy.set(true);
    this.markError.set(null);
    try {
      const { completedAt } = await this.learn.markLessonComplete(this.courseId(), this.lessonId());
      this.view.update((v) => (v ? { ...v, progress: { completedAt } } : v));
    } catch (err) {
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      this.markError.set(status === 403 ? 'revoked' : 'other');
    } finally {
      this.markBusy.set(false);
    }
  }
}
