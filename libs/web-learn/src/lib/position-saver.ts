import { HttpErrorResponse } from '@angular/common/http';

import type { LearnService } from './learn.service';

export interface PositionSaverOptions {
  learn: LearnService;
  courseId: string;
  lessonId: string;
  onRevoked: () => void;
  /** Defaults to 15_000 ms. Override for tests. */
  intervalMs?: number;
}

export class PositionSaver {
  private readonly learn: LearnService;
  private readonly courseId: string;
  private readonly lessonId: string;
  private readonly onRevoked: () => void;
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSent: number | null = null;
  private getTime: (() => number) | null = null;
  // A stopped saver must never signal revocation for a lesson it no longer represents.
  private cancelled = false;

  constructor(opts: PositionSaverOptions) {
    this.learn = opts.learn;
    this.courseId = opts.courseId;
    this.lessonId = opts.lessonId;
    this.onRevoked = opts.onRevoked;
    this.intervalMs = opts.intervalMs ?? 15_000;
  }

  start(getCurrentTime: () => number): void {
    this.getTime = getCurrentTime;
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), this.intervalMs);
  }

  async flush(): Promise<void> {
    if (!this.getTime) return;
    const seconds = Math.max(0, Math.floor(this.getTime()));
    if (this.lastSent === seconds) return;
    try {
      const out = await this.learn.savePosition(this.courseId, this.lessonId, seconds);
      if (this.cancelled) return;
      this.lastSent = out.lastWatchedSeconds;
    } catch (err) {
      if (this.cancelled) return;
      if (err instanceof HttpErrorResponse && err.status === 403) {
        this.stop();
        this.onRevoked();
      }
      // Other 4xx/5xx: leave lastSent unchanged so the next tick retries.
    }
  }

  flushBeacon = (): void => {
    if (!this.getTime || typeof navigator === 'undefined') return;
    const seconds = Math.max(0, Math.floor(this.getTime()));
    if (this.lastSent === seconds) return;
    const url = `/api/learn/courses/${encodeURIComponent(this.courseId)}/lessons/${encodeURIComponent(this.lessonId)}/position`;
    const body = JSON.stringify({ seconds });
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) this.lastSent = seconds;
      return;
    }
    void fetch(url, {
      method: 'POST',
      body,
      keepalive: true,
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    }).then(() => { this.lastSent = seconds; }).catch(() => undefined);
  };

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.getTime = null;
    this.cancelled = true;
  }
}
