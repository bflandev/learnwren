import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import type { LessonView } from '@learnwren/shared-data-models';
import { VideoPlayerComponent } from '@learnwren/web-video';

import { LearnService } from '../learn.service';

type PageState = 'LOADING' | 'READY' | 'PROCESSING' | 'NOT_ENROLLED' | 'NOT_FOUND' | 'LOAD_ERROR';

@Component({
  selector: 'lib-lesson-player-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VideoPlayerComponent],
  templateUrl: './lesson-player-page.component.html',
})
export class LessonPlayerPageComponent implements OnInit {
  private readonly learn = inject(LearnService);

  readonly courseId = input.required<string>();
  readonly lessonId = input.required<string>();

  readonly state = signal<PageState>('LOADING');
  readonly view = signal<LessonView | null>(null);

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
}
