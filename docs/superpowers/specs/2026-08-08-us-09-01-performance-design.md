> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# US-09-01: Performance — Slice Design

**Date:** 2026-08-08
**Story:** [US-09-01](../../epics/09-non-functional-requirements.md#us-09-01-performance) (EP-09, Non-Functional Requirements)
**Status:** Design approved; implementation not started.

---

## 1. Why this slice

Every story in EP-01 through EP-08 is shipped. EP-09 has two open stories:

| Story | Why not this slice |
| :--- | :--- |
| US-09-04 Self-hosting | Four of its five ACs (Docker Compose single-command deploy, no proprietary third-party services, `.env.example`) contradict the architecture fixed in `TECHNICAL_ARCHITECTURE.md` — Firebase Auth, Firestore, Cloud Storage, GCP Transcoder. Only the AGPL-3.0 `LICENSE` AC is met. This is a re-platforming programme needing an architecture-spec change and decomposition into sub-projects, not a slice. |
| **US-09-01 Performance** | **This slice.** Two of its four ACs are browser-measurable and fit the hermetic-CI-gate pattern established by US-09-03 and US-09-05. The other two are deferred on the record (§7). |

## 2. Current state

Surveyed 2026-08-08 at `b539346`.

- `apps/web/project.json` sets production bundle budgets (`initial` 1.25 MB warn / 1.4 MB error, `anyComponentStyle` 4 KB / 8 KB). Nothing else in the repo measures performance.
- Two hermetic Playwright sweeps exist and share plumbing: `web-e2e:a11y` (`playwright.a11y.config.ts`, `src/a11y/`) and `web-e2e:responsive` (`playwright.responsive.config.ts`, `src/responsive/`). Both stub every `/api` call via `page.route` through `src/_helpers/route-stubs.ts` and drive routes from the shared inventory in `src/_helpers/route-inventory.ts`, so neither needs the emulators or the NestJS api.
- **Both sweeps serve the app with `pnpm exec nx serve web`** — the Angular dev server: unminified, untree-shaken, with dev-mode change detection. That is fine for axe scans and overflow checks and fatal for timing measurements. §3 addresses it.
- No HLS fixture exists anywhere in the repo. `src/videos.spec.ts:257-258` records that the fake playback seam returns `gs-stub://…` segment URIs which hls.js cannot fetch. **No CI run has ever started video playback.**
- `apps/web/project.json` sets `outputPath` to `dist/apps/web`; the Angular application builder emits the browser bundle under `dist/apps/web/browser`.
- `.github/workflows/ci.yml` runs the a11y and responsive gates as separate jobs, each installing Chromium via `pnpm exec playwright install --with-deps chromium`.

## 3. Serving basis: the production build

The perf suite is the first sweep that cannot use the dev server. Dev-server bundles are several times the size of the production output and carry unoptimised change detection, so an LCP measured against them describes the dev server rather than the product.

- `web-e2e:perf` declares `dependsOn: ["web:build"]`, so Nx produces the production bundle before the suite runs.
- `playwright.perf.config.ts` starts a static file server over `dist/apps/web/browser` instead of `nx serve web`.
- The static server is a small `node:http` + `node:fs` module at `src/_helpers/static-server.ts` — roughly 30 lines: resolve the request path under the build output, guard against traversal outside it, serve the file with a correct `Content-Type`, and fall back to `index.html` for any path with no file extension so Angular's client-side routes resolve.

**Why not a dependency.** The workspace has no static server. `express` is present only transitively under `@nestjs/platform-express`; depending on a transitive package is fragile, and adding `http-server` or `serve` buys nothing a 30-line file does not already do for this one use.

**Why not `nx serve web --configuration=production`.** The Angular dev server applies production optimisation but still layers its own HMR/websocket client and dev middleware into the served page. A plain static server over the exact artefact the deploy ships is both simpler and closer to production.

## 4. The network and CPU model

Applied per test over the Chrome DevTools Protocol:

| Setting | Value |
| :--- | :--- |
| Download | 10 Mbps |
| Upload | 5 Mbps |
| Latency | 40 ms RTT |
| CPU throttle | 1× (none) |

This is a deliberate departure from Lighthouse's default profile (slow 4G, 4× CPU throttle), which models a mid-tier mobile phone on cellular. The AC says "a standard broadband connection", so the profile models desktop broadband. The numbers live in one named constant block in `src/_helpers/perf-measure.ts` with this rationale in a comment, so a future reader does not silently "fix" them to match Lighthouse.

API stubs are reused from `route-stubs.ts` with one addition: a fixed **150 ms** delay before each stubbed `/api` response. Without it the client renders against an impossibly instant server and the measurement flatters itself. The delay is fixed rather than random so the median-of-3 (§5) converges.

## 5. Load-time gate

**Metric.** Largest Contentful Paint, read via a `PerformanceObserver` on `largest-contentful-paint` installed through `page.addInitScript` before navigation, taking the final entry's `startTime` (relative to navigation start). LCP is chosen over the `load` event because it tracks when the user sees the page's main content, which is what "the page must load within 2 seconds" means to a student.

**Sampling.** Each route is navigated 3 times per run in a fresh context, and the assertion is made against the **median** of the three LCP values. A real regression moves the median; a single GC pause or cold-cache outlier does not. Cost is roughly 3 × 4 = 12 throttled navigations, seconds of wall clock.

**Routes and budgets.**

| Route | Path | Role | Budget |
| :--- | :--- | :--- | :--- |
| Landing | `/` | guest | baseline × 1.4 |
| Catalogue | `/courses` | guest | **2000 ms — the epic's number, hard** |
| Course detail | `/courses/:id` | guest | baseline × 1.4 |
| Learn page | `/learn/:courseId/:lessonId` | student | baseline × 1.4 |

These four are the student journey — the routes a student actually waits on. The catalogue budget comes from the AC and is not negotiable by measurement. The other three budgets are derived: during implementation, each route is measured 5 times on a quiet local machine, the median recorded, and the budget set to `ceil(median × 1.4 / 50) * 50` ms. **The measured baselines and resulting budgets are written back into this spec before the slice lands**, so the numbers in the repo have a recorded provenance rather than appearing as magic constants.

Exact paths and role stubs come from the shared `route-inventory.ts` fixtures, so the perf suite and the a11y/responsive suites cannot drift apart on what a route needs.

## 6. Video-start gate

**The fixture.** A 2-second AES-128 HLS asset generated once with local `ffmpeg` and committed under `apps/web-e2e/src/fixtures/hls/`: a variant playlist, the AES key file, and one or two `.ts` segments — on the order of 100 KB total. The generating command is recorded in a `README.md` beside the fixture so it can be regenerated deterministically. **CI does not need ffmpeg**; it consumes the committed bytes.

**Serving it.** `src/_helpers/hls-fixture.ts` registers `page.route` handlers that fulfil the playlist, key, and segment requests from disk with the correct content types, and stubs the playback-manifest endpoint so the player is pointed at the fixture playlist. Chromium runs hls.js (native HLS is a Safari/iOS path and is out of scope for this Chromium-only gate).

**The measurement.** Navigate to the lesson page, wait for the player to mount, start the clock, click play, and stop the clock at the first `timeupdate` event where `video.currentTime > 0` — i.e. a frame has actually been decoded and presented, not merely that the manifest parsed. Budget **3000 ms**, hard, from the AC. Median of 3, same as §5.

This is the first thing in the repo that proves video playback starts at all, which is worth more than the timing number it asserts.

## 7. Deferred criteria, on the record

Two ACs are not satisfied by this slice and are amended into `docs/epics/09-non-functional-requirements.md` with the reason, the way US-09-05 amended its touch-target criterion:

- **"TTFB under 500 ms for 95% of requests under normal load"** and **"at least 100 concurrent users without degradation"** require a load harness (k6 or equivalent) driving the deployed production API. They cannot be verified in this slice. Measuring them against the Firebase emulators would produce a number with no relationship to production Cloud Functions — cold starts, autoscaling, and Firestore's real latency profile are all absent from the emulator — so a green emulator result would be worse than no result, because it would read as evidence.

The amendment states this explicitly rather than leaving the ACs silently unmet, and names a load-test pass against production as the follow-up that would close them.

## 8. Files

**New**

| Path | Purpose |
| :--- | :--- |
| `apps/web-e2e/playwright.perf.config.ts` | Perf suite config; static-server `webServer`, `testDir: './src/perf'` |
| `apps/web-e2e/src/perf/load-time.perf.spec.ts` | The four-route LCP gate |
| `apps/web-e2e/src/perf/video-start.perf.spec.ts` | The click-to-first-frame gate |
| `apps/web-e2e/src/_helpers/perf-measure.ts` | Throttle constants, LCP observer, median-of-3 helper |
| `apps/web-e2e/src/_helpers/hls-fixture.ts` | Route handlers serving the HLS fixture |
| `apps/web-e2e/src/_helpers/static-server.ts` | `node:http` static server with SPA fallback |
| `apps/web-e2e/src/fixtures/hls/` | Playlist, key, segments, and the regeneration README |

**Modified**

| Path | Change |
| :--- | :--- |
| `apps/web-e2e/project.json` | `perf` target, `dependsOn: ["web:build"]` |
| `apps/web-e2e/src/_helpers/route-stubs.ts` | Optional fixed response delay |
| `.github/workflows/ci.yml` | Perf gate job, mirroring the responsive gate job |
| `docs/epics/09-non-functional-requirements.md` | Amend the two deferred ACs (§7) |
| `README.md` | US-09-01 entry in the shipped-slices list, with honest scope |
| `docs/USER_GUIDE.md` | Performance entry if the feature matrix warrants it |

## 9. Testing

The suite *is* the test, so "tests for the tests" would be circular. What gets verified instead:

1. **The gate fails when it should.** Before landing, temporarily inflate a budget's opposite — e.g. add an artificial 3-second delay to the catalogue's stubbed response — and confirm the catalogue test goes red. A perf gate that has never been seen to fail is not known to be a gate.
2. **The video gate fails when playback does not start.** Break the fixture key URI and confirm the spec times out red rather than passing on a player that never plays.
3. **The static server serves the right artefact.** Confirm the served `index.html` references hashed production bundle filenames, not dev-server paths.
4. **Existing suites are unaffected.** `nx affected -t lint test build typecheck`, plus `nx run web-e2e:a11y` and `nx run web-e2e:responsive`, stay green.

Unit-testable pieces — the median helper and the static server's path resolution and traversal guard — get ordinary vitest specs.

## 10. Honest scope

The gate proves client render cost and bundle weight under a modelled 10 Mbps / 40 ms broadband link, on Chromium, on CI hardware, against stubbed API responses with a fixed 150 ms delay. It does not prove real-world API latency, CDN or cold-start behaviour, performance on other browsers or on real mobile hardware, or anything at all about concurrency. Two of the story's four acceptance criteria remain formally deferred (§7). This is a regression gate, not a performance certification.

## 11. Risks

| Risk | Mitigation |
| :--- | :--- |
| CI runners are noisy enough that median-of-3 still flakes | Baselines are measured with 40% headroom; if flakes appear, widen the derived budgets (never the hard 2000/3000 ms AC budgets) and record why |
| The committed HLS fixture rots against a future player change | The regeneration command lives beside the fixture; a broken fixture fails loudly rather than silently passing |
| `dist/apps/web/browser` path changes with an Angular builder upgrade | The static server resolves the directory once and fails fast with a clear message if it is absent |
| Someone "corrects" the throttle profile to Lighthouse defaults | The departure and its reason are commented at the constant block (§4) |
