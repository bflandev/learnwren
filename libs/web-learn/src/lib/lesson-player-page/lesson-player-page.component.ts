import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import type {
  CourseId,
  CourseOutline,
  ISODateString,
  LessonId,
  LessonView,
  MaterialId,
} from '@learnwren/shared-data-models';
import { HlmAlert, HlmBadge, HlmButton, HlmCard } from '@learnwren/web-ui';
import { VideoPlayerComponent } from '@learnwren/web-video';

import { CourseOutlinePanelComponent } from '../course-outline-panel/course-outline-panel.component';
import { LearnService } from '../learn.service';
import { PositionSaver } from '../position-saver';

type PageState = 'LOADING' | 'READY' | 'PROCESSING' | 'NOT_ENROLLED' | 'NOT_FOUND' | 'LOAD_ERROR';

type MaterialRowState =
  | { status: 'idle' }
  | { status: 'preparing' }
  | { status: 'error'; kind: 'gone' | 'forbidden' | 'other' };

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

@Component({
  selector: 'lib-lesson-player-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    VideoPlayerComponent,
    DatePipe,
    CourseOutlinePanelComponent,
    HlmAlert,
    HlmBadge,
    HlmButton,
    HlmCard,
  ],
  templateUrl: './lesson-player-page.component.html',
})
export class LessonPlayerPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly learn = inject(LearnService);
  private readonly destroyRef = inject(DestroyRef);

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

  readonly materialRowState = signal<Map<MaterialId, MaterialRowState>>(new Map());

  rowState(id: MaterialId): MaterialRowState {
    return this.materialRowState().get(id) ?? { status: 'idle' };
  }

  readonly formatBytes = formatBytes;

  readonly outline = computed<CourseOutline | null>(() => this.view()?.outline ?? null);
  readonly captionsTrack = computed<{ src: string; srclang: string; label: string } | null>(() => {
    const l = this.view()?.lesson;
    if (!l?.videoId || !l.captions) return null;
    return { src: `/api/playback/captions/${l.videoId}`, srclang: l.captions.language, label: l.captions.label };
  });
  // A single MediaQueryList drives the responsive layout reactively. matchMedia
  // results are NOT signal dependencies, so reading them directly inside a
  // computed() never re-evaluated on resize and left outlineMode stuck at the
  // first-render breakpoint (hiding the drawer toggle on mobile). We mirror the
  // query into a signal via its 'change' event instead.
  private readonly desktopQuery =
    // Stryker disable next-line ConditionalExpression,StringLiteral: SSR guard — window is always defined under jsdom; killing requires an SSR (no-DOM) harness not present here
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)') : null;
  // Stryker disable next-line OptionalChaining,LogicalOperator,BooleanLiteral: desktopQuery is never null under jsdom (window defined), so the `?.`/`?? true`(`?? false`) fallback is unreachable; `x ?? true` ≡ `x && true` for the boolean `matches`
  private readonly isDesktop = signal<boolean>(this.desktopQuery?.matches ?? true);
  private readonly onDesktopChange = (e: MediaQueryListEvent): void =>
    this.isDesktop.set(e.matches);

  // Always starts open, on every viewport. The outline is the student's
  // course navigation; defaulting it closed on mobile/tablet (tied to
  // isDesktop) left it undiscoverable behind an unlabelled toggle on first
  // load — "Course outline" gives no visual hint that it expands anything,
  // and nothing in the initial render shows a student where they are in the
  // course. Drawer mode still auto-closes it after picking a lesson
  // (CourseOutlinePanelComponent.onRowClick) and on Escape, so mobile users
  // get the space back once they've made a choice.
  readonly outlineOpen = signal<boolean>(true);
  readonly outlineMode = computed<'sidebar' | 'drawer'>(() =>
    this.isDesktop() ? 'sidebar' : 'drawer',
  );

  private saver: PositionSaver | null = null;
  // Stryker disable next-line BooleanLiteral: applyRouteParams() resets hasResumed=false on every load before any onMetadata() can run, so the field initializer value is always overwritten before use — equivalent
  private hasResumed = false;
  /**
   * Monotonic token identifying the most recent load(). getLessonView is a
   * non-cancellable Promise, so a slow earlier request can resolve AFTER a newer
   * one (rapid outline clicks). Discarding any result whose token is stale stops
   * an old lesson's response overwriting the current lesson's view/state.
   */
  private loadToken = 0;
  private readonly onPageHide = (): void => this.saver?.flushBeacon();
  private readonly onVisibilityChange = (): void => {
    // Stryker disable next-line ConditionalExpression,StringLiteral: SSR guard — `typeof document !== 'undefined'` is always true under jsdom, so `true && X` ≡ `X`; killing requires a no-DOM harness not present here
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.saver?.flushBeacon();
    }
  };

  ngOnInit(): void {
    // Stryker disable next-line ConditionalExpression,StringLiteral: SSR guard — window always defined under jsdom, so the guard body always runs identically; killing requires a no-DOM harness not present here
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.onPageHide);
    }
    // Stryker disable next-line ConditionalExpression,StringLiteral: SSR guard — document always defined under jsdom, so the guard body always runs identically; killing requires a no-DOM harness not present here
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    // Stryker disable next-line OptionalChaining: desktopQuery is never null under jsdom (window defined), so `?.`→`.` is unreachable equivalent
    this.desktopQuery?.addEventListener('change', this.onDesktopChange);
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      void this.applyRouteParams(pm.get('courseId'), pm.get('lessonId'));
    });
  }

  /**
   * Reacts to a route param change (initial load OR outline-driven nav between
   * lessons on the same route). Angular reuses the component instance so we
   * must reset per-lesson state and re-fetch the LessonView ourselves.
   */
  private async applyRouteParams(
    courseId: string | null,
    lessonId: string | null,
  ): Promise<void> {
    if (!courseId || !lessonId) {
      this.state.set('NOT_FOUND');
      return;
    }
    if (courseId === this.courseId && lessonId === this.lessonId && this.view() !== null) {
      return;
    }
    this.saver?.stop();
    this.saver = null;
    this.hasResumed = false;
    this.markBusy.set(false);
    this.markError.set(null);
    this.materialRowState.set(new Map());
    this.courseId = courseId as CourseId;
    this.lessonId = lessonId as LessonId;
    await this.load();
  }

  ngOnDestroy(): void {
    // Stryker disable next-line ConditionalExpression,StringLiteral: SSR guard — window always defined under jsdom, so the guard body always runs identically; killing requires a no-DOM harness not present here
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHide);
    }
    // Stryker disable next-line ConditionalExpression,StringLiteral: SSR guard — document always defined under jsdom, so the guard body always runs identically; killing requires a no-DOM harness not present here
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    // Stryker disable next-line OptionalChaining: desktopQuery is never null under jsdom (window defined), so `?.`→`.` is unreachable equivalent
    this.desktopQuery?.removeEventListener('change', this.onDesktopChange);
    this.saver?.stop();
    this.saver = null;
  }

  private async load(): Promise<void> {
    // Stryker disable next-line UpdateOperator: `--` vs `++` both yield a unique, monotonic token; the only use is the `token !== this.loadToken` staleness check, which behaves identically either direction — equivalent
    const token = ++this.loadToken;
    this.state.set('LOADING');
    try {
      const view = await this.learn.getLessonView(this.courseId, this.lessonId);
      if (token !== this.loadToken) return; // superseded by a newer load
      this.view.set(view);
      const v = view.lesson;
      if (v.videoId && v.videoState === 'READY') {
        this.state.set('READY');
        this.ensureSaver();
      } else {
        this.state.set('PROCESSING');
      }
    } catch (err) {
      if (token !== this.loadToken) return; // superseded by a newer load
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
    // Stryker disable next-line OptionalChaining: ensureSaver() guarantees this.saver is non-null at this point (we already returned for owner-preview), so `?.`→`.` is unreachable equivalent
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

  async onDownloadMaterial(matId: MaterialId): Promise<void> {
    this.setRow(matId, { status: 'preparing' });
    try {
      const { downloadUrl } = await this.learn.requestDownloadUrl(matId);
      this.openDownload(downloadUrl);
      this.setRow(matId, { status: 'idle' });
    } catch (err) {
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      const kind: 'gone' | 'forbidden' | 'other' =
        status === 404 ? 'gone' : status === 403 ? 'forbidden' : 'other';
      this.setRow(matId, { status: 'error', kind });
    }
  }

  /**
   * Synchronous anchor click instead of window.open: window.open after an
   * await is popup-blocked on Safari. Extracted so tests can spy on it.
   */
  protected openDownload(url: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  private setRow(id: MaterialId, next: MaterialRowState): void {
    this.materialRowState.update((m) => {
      const copy = new Map(m);
      copy.set(id, next);
      return copy;
    });
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
