import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, defer, timer } from 'rxjs';
import { expand, switchMap, takeWhile } from 'rxjs/operators';

import type { Video, VideoId } from '@learnwren/shared-data-models';

const TERMINAL: ReadonlyArray<Video['state']> = ['READY', 'FAILED'];
const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_CAP_MS = 30 * 60 * 1_000;

export interface PollOptions {
  intervalMs?: number;
  capMs?: number;
}

@Injectable({ providedIn: 'root' })
export class VideoStatePollingService {
  private readonly http = inject(HttpClient);

  poll(vid: VideoId, opts: PollOptions = {}): Observable<Video> {
    const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
    const capMs = opts.capMs ?? DEFAULT_CAP_MS;
    const start = Date.now();
    const fetch = (): Observable<Video> =>
      this.http.get<Video>(`/api/videos/${vid}`, { withCredentials: true });
    return defer(fetch).pipe(
      expand((v) => {
        // Stryker disable next-line ConditionalExpression: redundant fast-path. The inclusive takeWhile below stops the stream on the first terminal value and synchronously unsubscribes this expand (cancelling any pending timer), so removing this guard schedules a poll that is torn down before it can fire — no observable difference. Equivalent mutant.
        if (TERMINAL.includes(v.state)) return EMPTY;
        const elapsed = Date.now() - start;
        // Skip scheduling if there isn't budget for at least two more intervals.
        // Stops the loop cleanly before the cap rather than racing into it.
        if (elapsed + intervalMs * 2 > capMs) return EMPTY;
        return timer(intervalMs).pipe(switchMap(fetch));
      }),
      takeWhile((v) => !TERMINAL.includes(v.state), /* inclusive */ true),
    );
  }
}
