import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import type { CourseId, CourseOutline, ISODateString, LessonId, LessonView } from '@learnwren/shared-data-models';
import { VideoPlayerComponent } from '@learnwren/web-video';

import { CourseOutlinePanelComponent } from '../course-outline-panel/course-outline-panel.component';
import { LearnService } from '../learn.service';
import { PositionSaver } from '../position-saver';

type PageState = 'LOADING' | 'READY' | 'PROCESSING' | 'NOT_ENROLLED' | 'NOT_FOUND' | 'LOAD_ERROR';

@Component({
  selector: 'lib-lesson-player-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VideoPlayerComponent, DatePipe, CourseOutlinePanelComponent],
  templateUrl: './lesson-player-page.component.html',
})
export class LessonPlayerPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly learn = inject(LearnService);

  courseId: CourseId = '' as CourseId;
  lessonId: LessonId = '' as LessonId;

  @ViewChild(VideoPlayerComponent) private playerRef?: VideoPlayerComponent;

  readonly state = signal<PageState>('LOADING');
  readonly view = signal<LessonView | null>(null);

  readonly completedAt = computed<ISODateString | null>(
    () => this.view()?.progress?.completedAt ?? null,
  );
  readonly lastWatchedSeconds = computed<number>(
    () => this.view()?.progress?.lastWatchedSeconds ?? 0,
  );
  readonly isOwnerPreview = computed<boolean>(() => this.view()?.progress === null);
  readonly markBusy = signal<boolean>(false);
  readonly markError = signal<null | 'revoked' | 'other'>(null);

  readonly outline = computed<CourseOutline | null>(() => this.view()?.outline ?? null);
  readonly outlineOpen = signal<boolean>(
    typeof window !== 'undefined'
      ? window.matchMedia('(min-width: 1024px)').matches
      : true,
  );
  readonly outlineMode = computed<'sidebar' | 'drawer'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
      ? 'sidebar'
      : 'drawer',
  );

  private saver: PositionSaver | null = null;
  private hasResumed = false;
  private readonly onPageHide = (): void => this.saver?.flushBeacon();
  private readonly onVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.saver?.flushBeacon();
    }
  };

  async ngOnInit(): Promise<void> {
    const courseId = this.route.snapshot.paramMap.get('courseId');
    const lessonId = this.route.snapshot.paramMap.get('lessonId');
    if (!courseId || !lessonId) {
      this.state.set('NOT_FOUND');
      return;
    }
    this.courseId = courseId as CourseId;
    this.lessonId = lessonId as LessonId;
    await this.load();
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.onPageHide);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHide);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.saver?.stop();
    this.saver = null;
  }

  private async load(): Promise<void> {
    this.state.set('LOADING');
    try {
      const view = await this.learn.getLessonView(this.courseId, this.lessonId);
      this.view.set(view);
      const v = view.lesson;
      if (v.videoId && v.videoState === 'READY') {
        this.state.set('READY');
        this.ensureSaver();
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

  toggleOutline(): void {
    this.outlineOpen.update((v) => !v);
  }

  async onLessonSelected(nextLessonId: LessonId): Promise<void> {
    try {
      await this.saver?.flush();
    } catch (err) {
      console.warn('[learn] flushPosition rejected during outline nav', err);
    }
    await this.router.navigateByUrl(`/learn/${this.courseId}/${nextLessonId}`);
  }

  /**
   * Called from the template via (metadata)="onMetadata()". The optional
   * `duration` arg is a test affordance — at runtime we read it from the
   * playerRef.
   */
  onMetadata(duration?: number): void {
    if (this.hasResumed || this.isOwnerPreview()) return;
    this.hasResumed = true;
    const d = duration ?? this.playerRef?.playerEl?.nativeElement.duration ?? 0;
    const saved = this.lastWatchedSeconds();
    if (!Number.isFinite(d) || d <= 0 || saved <= 0) return;
    if (saved >= d) {
      this.seekVideoTo(0);
      return;
    }
    this.seekVideoTo(Math.min(saved, Math.max(0, d - 5)));
  }

  onPlayed(): void {
    if (this.isOwnerPreview()) return;
    this.ensureSaver();
    this.saver?.start(() => this.playerRef?.currentTime() ?? 0);
  }

  onPaused(): void {
    void this.saver?.flush();
  }

  onEnded(): void {
    void this.saver?.flush();
  }

  /** Component hook invoked by PositionSaver on a 403 (enrolment revoked mid-session). */
  onSaverRevoked(): void {
    this.state.set('NOT_ENROLLED');
    this.saver?.stop();
    this.saver = null;
  }

  /** Indirection so tests can spy on the seek without needing a real <video>. */
  seekVideoTo(seconds: number): void {
    this.playerRef?.seekTo(seconds);
  }

  async onMarkComplete(): Promise<void> {
    this.markBusy.set(true);
    this.markError.set(null);
    try {
      const { completedAt } = await this.learn.markLessonComplete(this.courseId, this.lessonId);
      this.view.update((v) =>
        v
          ? {
              ...v,
              progress: {
                completedAt,
                lastWatchedSeconds: v.progress?.lastWatchedSeconds ?? 0,
              },
            }
          : v,
      );
    } catch (err) {
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      this.markError.set(status === 403 ? 'revoked' : 'other');
    } finally {
      this.markBusy.set(false);
    }
  }

  private ensureSaver(): void {
    if (this.saver || this.isOwnerPreview()) return;
    this.saver = new PositionSaver({
      learn: this.learn,
      courseId: this.courseId,
      lessonId: this.lessonId,
      onRevoked: () => this.onSaverRevoked(),
    });
  }
}
