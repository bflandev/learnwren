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

**Metrics — two, not one.**

1. **Largest Contentful Paint**, read via a `PerformanceObserver` on `largest-contentful-paint` installed through `page.addInitScript` before navigation, taking the final entry's `startTime` (relative to navigation start).
2. **Time to content**: elapsed wall-clock time from immediately before `page.goto` until the route's `expectText` is visible inside `<main>`. Added after the first implementation pass found that LCP alone is blind to the catalogue's actual failure mode: **the catalogue's LCP candidate is its static `<h1>Course catalogue</h1>` heading, which paints before `/api/catalog` responds** — injecting a 3000 ms delay into that stub during development left the catalogue's LCP median completely unchanged (~1400 ms) because the course-card grid never produces an element large enough (and its CSS-gradient covers aren't `url()`-based, so aren't LCP-eligible at all) to overtake the already-painted heading. Time to content can only complete once the stubbed data has actually rendered, so it is the metric that can fail for a catalog-data-load regression, which is what "loads within 2 seconds" is actually meant to guard against.

LCP remains the gated metric for the landing page, which has no stubbed API calls at all — there is no "content becomes visible after data loads" event to time, so LCP is the only meaningful render-cost signal there and landing's budget is derived from LCP alone. Landing still carries an `expectText` (its hero `<h1>`) so that its test has the same render guard as every other route: without one, a landing page that rendered nothing but the app header would still produce an LCP and pass its budget. Its time to content is therefore measured and logged too, but not gated.

Both metrics are scoped/anchored consistently: LCP's zero is the browser's navigation start (`performance.now()`-based, inside the page); time to content's zero is `Date.now()` immediately before `page.goto` (in the test process) — both mark the same instant, the start of that navigation.

**Sampling.** Each route is navigated `SAMPLE_COUNT` (3) times per metric per run in a fresh context, and each metric is asserted independently against the **median** of its three values. A real regression moves the median; a single GC pause or cold-cache outlier does not.

**Calibration hardware.** Budgets below are calibrated against a **GitHub Actions runner**, not a local developer machine. A first pass measured budgets on a local Mac mini (Apple M4); CI calibration on the actual runner this gate executes against in production found every route's medians 10-100ms higher than local, and the catalogue's time-to-content specifically cleared its hard 2000ms budget by only 11ms locally-derived vs the number now recorded below. Runner hardware is slower and noisier than a quiet local machine, and it is the *only* hardware this gate actually needs to be correct on — a gate calibrated to pass comfortably on a fast Mac and then run for real on a shared CI runner is calibrated against the wrong machine. The numbers below are the CI runner's.

**Routes, budgets, and which metrics gate.**

| Route | Path | Role | Measured LCP median | Measured TTC median | Budget | LCP gated? | TTC gated? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Landing | `/` | guest | 1336 ms | measured, not gated (no stubbed data to wait on) | 1900 ms (`ceil(1336 × 1.4 / 50) × 50`, LCP only) | yes | no |
| Catalogue | `/catalog` | guest | 1424 ms | 1989 ms | **2000 ms — the epic's number, hard** | yes | **no — see below** |
| Course detail | `/catalog/c-1` | guest | 1556 ms | 1984 ms | 2800 ms (`ceil(1984 × 1.4 / 50) × 50`) | yes | yes |
| Learn page | `/learn/c-1/l-1` | student | 1576 ms | 1973 ms | 2800 ms (`ceil(1973 × 1.4 / 50) × 50`) | yes | yes |

Paths verified against `route-inventory.ts` at `b539346`. Note `/courses` is the *instructor* course list, not the catalogue.

These four are the student journey — the routes a student actually waits on. The other three budgets are derived from `ceil(max(median LCP, median TTC) × 1.4 / 50) * 50` ms — except landing, which gates LCP only and so derives its budget from LCP alone — time to content is the higher of the two metrics for every route measured, since it includes the 150 ms stub delay plus render time that LCP alone can miss. (Landing's local-measurement budget, 1850ms, was recalculated to 1900ms against the CI number above; course detail and learn page's budgets were unchanged by the recalculation — both round to 2800ms under either machine's numbers.)

**The catalogue's time-to-content is measured and logged on every run, but not gated — this is a deliberate, documented exception, not a dropped assertion.** CI calibration found the catalogue's TTC median at **1989 ms against its hard 2000 ms acceptance-criterion budget: an 11 ms margin.** That is not headroom, it is a coin flip against ordinary runner jitter — gating it would red-build the suite on noise, not on regressions. Compounding this: the other two routes' TTC medians (1984 ms, 1973 ms) sit in the same ~1980 ms band regardless of what each route's stubbed payload actually is, and the samples do not trend down across repeated navigations within a run. That pattern means the ~1980 ms figure is dominated by **cold production-bundle download over the modelled 10 Mbps link plus Angular bootstrap** — a cost paid by every route alike — not by anything catalogue-specific that this gate could usefully catch. Gating a number that doesn't move for the reason the AC cares about would not be testing the AC; it would be testing bundle size with unacceptable flakiness attached.

**This is a real, currently-unmet acceptance criterion, not a resolved one.** The product's catalogue does not reliably clear "loads within 2 seconds" on cold load against modelled broadband — 1989ms against 2000ms leaves no real margin. That finding is recorded in `docs/epics/09-non-functional-requirements.md` and `README.md` (Task 8) as needing bundle-weight optimisation outside this slice, the same way US-09-05 recorded its own deferred criterion. Explicitly rejected as fixes here: widening the 2000ms budget, switching to a warm-cache measurement model (which would hide the real cold-load cost this AC is about), or gating TTC at 2000ms and accepting the resulting flakiness. The catalogue's LCP budget stays gated and hard — with the render-content guard now the *only* assertion protecting that test from a fixture-shape regression reading as a pass, so it is retained unconditionally regardless of which metrics a route gates.

**Raw CI samples** (GitHub Actions runner, 2026-08-08, via the branch-scoped calibration workflow, production build):

| Route | Metric | Median (ms) |
| :--- | :--- | :--- |
| Landing | LCP | 1336 |
| Catalogue | LCP | 1424 |
| Catalogue | TTC | 1989 |
| Course detail | LCP | 1556 |
| Course detail | TTC | 1984 |
| Learn page | LCP | 1576 |
| Learn page | TTC | 1973 |

(Per-sample raw values are not retained by the calibration workflow's summary output — only medians.)

**Local measurements that preceded the CI calibration** (Mac mini, Apple M4, 16 GB, macOS Darwin 25.5.0; `NX_DAEMON=false pnpm exec nx run web-e2e:perf` against the production build on an otherwise-quiet machine, 5 samples per route, two full runs). These are recorded here because they are what the budget formula was first derived against, and because their agreement with the CI numbers above is the evidence that the harness measures the product rather than the machine:

| Route | Metric | Run 1 samples (ms) | Run 1 median | Run 2 samples (ms) | Run 2 median |
| :--- | :--- | :--- | ---: | :--- | ---: |
| Landing | LCP | 1380, 1304, 1320, 1308, 1304 | 1308 | 1368, 1316, 1320, 1308, 1312 | 1316 |
| Catalogue | LCP | 1416, 1400, 1396, 1400, 1404 | 1400 | 1416, 1404, 1400, 1416, 1432 | 1416 |
| Catalogue | TTC | 1963, 1964, 1955, 1963, 1958 | 1963 | 1976, 1967, 1968, 1963, 1967 | 1967 |
| Course detail | LCP | 1556, 1540, 1528, 1544, 1552 | 1544 | 1552, 1544, 1544, 1548, 1548 | 1548 |
| Course detail | TTC | 1973, 1972, 1977, 1970, 1962 | 1972 | 1970, 1970, 1976, 1968, 1961 | 1970 |
| Learn page | LCP | 1572, 1568, 1548, 1564, 1540 | 1564 | 1572, 1556, 1560, 1556, 1552 | 1556 |
| Learn page | TTC | 1969, 1962, 1964, 1967, 1965 | 1965 | 1972, 1958, 1961, 1961, 1964 | 1961 |

(No landing TTC row: landing had no `expectText` at the time of these runs. It was given one later so its test would carry a render guard like every other route; its time to content measures ~1370 ms locally and is logged but not gated.)

The two runs agreed to within 1% on every metric and route (largest spread: course detail TTC, 1972 vs 1970), so no third run was taken. Note the local catalogue TTC medians — 1963 ms and 1967 ms — cleared the hard 2000 ms budget by ~35 ms, which is why the metric was originally gated; the CI runner's 1989 ms is what closed that margin and forced the ruling above. That divergence is the whole argument for calibrating on the hardware CI actually gates on.

**Harness soundness.** Two manipulations confirmed the harness measures what it claims before any budget was trusted. Injecting a 3000 ms — then a 10000 ms — delay into the catalogue's stubs left its LCP median flat at ~1400 ms, which is what exposed the LCP-locks-onto-the-`<h1>` blind spot and led to time-to-content being added as a second metric at all. The same 3000 ms delay injected into the *course detail* stubs moved that route's LCP median 1:1 with the delay (samples 4416, 4392, 4380 ms against its then-2200 ms budget), proving the throttle, stub delay, LCP observer, median, and budget assertion all work end to end and that the catalogue's flat LCP was a real property of that page, not a broken measurement.

**Red-proof.** Injecting a 3000 ms delay into the catalogue's `/api/categories` and `/api/catalog` stubs failed the catalogue test on time-to-content (median 4470 ms, back when that metric was still gated) while leaving LCP for that same run at ~1400 ms and the other three routes' tests passing — confirming time-to-content, not LCP, is what makes this gate sensitive to a catalog-data-load regression. That result is precisely why the catalogue's TTC not clearing its own budget by only 11ms in real CI is a genuine, actionable finding rather than an artifact of a badly-designed check.

Exact paths and role stubs come from the shared `route-inventory.ts` fixtures, so the perf suite and the a11y/responsive suites cannot drift apart on what a route needs.

## 6. Video-start gate

**The fixture.** A 2-second AES-128 HLS asset generated once with local `ffmpeg` and committed under `apps/web-e2e/src/fixtures/hls/`: a variant playlist, the AES key file, and one or two `.ts` segments — on the order of 100 KB total. The generating command is recorded in a `README.md` beside the fixture so it can be regenerated deterministically. **CI does not need ffmpeg**; it consumes the committed bytes.

**Serving it.** `src/_helpers/hls-fixture.ts` registers `page.route` handlers from disk, mirroring the four real endpoints the player actually walks (verified against `playback.controller.ts` and `manifest.rewriter.ts` at `b539346`):

| Request | Fulfilled with | Content-Type |
| :--- | :--- | :--- |
| `**/api/playback/manifest/v-1` | master playlist, variant URI pointing at the rendition path below | `application/vnd.apple.mpegurl` |
| `**/api/playback/manifest/v-1/rendition/720p` | rendition playlist; `#EXT-X-KEY` URI `/api/playback/keys/v-1`, segment URIs `/perf-fixture/seg*.ts` | `application/vnd.apple.mpegurl` |
| `**/api/playback/keys/v-1` | the 16-byte AES key | `application/octet-stream` |
| `**/perf-fixture/*.ts` | the segment bytes | `video/mp2t` |

Segment URIs are a synthetic in-page path rather than the absolute signed GCS URLs production emits, because a signed URL is unstubbable-by-design; the shape the *player* sees — "playlist hands me URLs, I fetch them" — is identical.

Two prerequisites the fixture also needs:

- `GET /api/playback/config` must be stubbed `{ fakePlayback: false }`. In fake mode `VideoPlayerComponent` shows a dev placeholder and never mounts hls.js (`video-player.component.html:14-21`), so the gate would measure nothing.
- The learn-page lesson fixture needs a **new** `LESSON_PAYLOAD_READY` export in `route-inventory.ts` with `videoId: 'v-1'` and `videoState: 'READY'`. The existing `LESSON_PAYLOAD` has both `null` deliberately, which renders the "processing" state and no player at all.

Chromium runs hls.js (native HLS is a Safari/iOS path, out of scope for this Chromium-only gate).

**The measurement.** Navigate to the lesson page, wait for `[data-testid="video-player"]` to attach, start the clock, invoke `play()` on the video element, and stop the clock at the first `timeupdate` where `currentTime > 0` — i.e. a frame has actually been decoded and presented, not merely that the manifest parsed. Budget **3000 ms**, hard, from the AC. Median of 3, same as §5.

The player uses native `<video controls>` (`video-player.component.html:2-8`), whose buttons live in the browser's shadow UI and are not reliably clickable from Playwright. Calling `play()` is the honest equivalent of the user's click: it starts the same clock at the same point in the pipeline. The spec records this substitution in a comment so no reader mistakes it for a real pointer event.

**What the timer actually brackets.** `VideoPlayerComponent.ngAfterViewInit` mounts hls.js on page load, and hls.js's default `autoStartLoad: true` starts fetching and decrypting the manifest, key, and segment immediately — before the clock in this spec ever starts. The clock starts inside `player.evaluate()`, which runs only after `page.goto`, the `toBeAttached()` wait, and the two zero-count guard assertions have all resolved; by then the ~24 KB fixture segment has almost certainly already been fetched and decrypted off-clock. The measured ~260 ms median is therefore "MSE append + decode + first paint on an already-buffered segment", not "click-to-first-frame from a cold page load". This is a defensible reading of the AC — a real user clicks play on a page that has already been sitting there loading, not at the instant of navigation — and it matches production's own hls.js configuration, so `autoStartLoad` is intentionally left enabled rather than disabled to widen the measured window. The consequence, stated plainly: **this gate cannot detect a regression in manifest, key, or segment fetch latency** — those already happened before the clock started. It detects regressions in MSE append/decode/paint cost only. See §10.

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

**The gate does not enforce the catalogue's time-to-content**, and by extension does not fully enforce "the course catalogue page must load within 2 seconds" end to end. The catalogue's time-to-content is measured and logged every run (median 1989ms against the 2000ms AC on CI hardware — see §5) but is not asserted, because that margin is statistically indistinguishable from runner noise. Only the catalogue's LCP is gated. The AC is formally recorded as unmet, pending bundle-weight work, in `docs/epics/09-non-functional-requirements.md` and `README.md` — not silently narrowed here.

The video-start gate carries a narrower scope than its passing number suggests. Because hls.js's `autoStartLoad: true` begins fetching and decrypting the manifest, key, and segment on page mount — before this spec's clock starts inside `player.evaluate()` — the ~260 ms median measures MSE append, decode, and first paint on a segment that has almost certainly already been fetched and decrypted off-clock. It does not measure, and cannot catch a regression in, manifest/key/segment fetch latency. §6 records this in detail. A reader should not conclude from the 260 ms/3000 ms margin that the full playback pipeline has enormous headroom; only the decode-and-paint tail of it does.

## 11. Risks

| Risk | Mitigation |
| :--- | :--- |
| CI runners are noisy enough that median-of-3 still flakes | Baselines are measured with 40% headroom; if flakes appear, widen the derived budgets (never the hard 2000/3000 ms AC budgets) and record why |
| The committed HLS fixture rots against a future player change | The regeneration command lives beside the fixture; a broken fixture fails loudly rather than silently passing |
| `dist/apps/web/browser` path changes with an Angular builder upgrade | The static server resolves the directory once and fails fast with a clear message if it is absent |
| Someone "corrects" the throttle profile to Lighthouse defaults | The departure and its reason are commented at the constant block (§4) |
