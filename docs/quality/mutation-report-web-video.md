# Mutation Test Report — `libs/web-video`

> Generated 2026-10-12T04:03:33.301Z

**Headline mutation score: 100.00%** (killed=455, survived=0, no-cov=0, ignored=9). Score on covered mutants only: 100.00%. Adjusted (equivalent candidates excluded): 100.00%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/player/video-player.service.ts` | 100.0% | 63 | 0 | 0 |
| `src/lib/polling/video-state-polling.service.ts` | 100.0% | 23 | 0 | 0 |
| `src/lib/upload/video-upload.service.ts` | 100.0% | 176 | 0 | 0 |
| `src/lib/playback-config.service.ts` | 100.0% | 11 | 0 | 0 |
| `src/lib/player/caption-tracks.ts` | 100.0% | 4 | 0 | 0 |
| `src/lib/player/video-player.component.ts` | 100.0% | 63 | 0 | 0 |
| `src/lib/upload/video-upload.component.ts` | 100.0% | 11 | 0 | 0 |
| `src/lib/video-state-badge.component.ts` | 100.0% | 92 | 0 | 0 |
| `src/lib/video.service.ts` | 100.0% | 12 | 0 | 0 |

## Survivor clusters — gaps to close

_No actionable survivors after filtering equivalent candidates._

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-video.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
