# Mutation Test Report — `libs/web-video`

> Generated 2026-10-12T01:02:16.486Z

**Headline mutation score: 99.78%** (killed=454, survived=1, no-cov=0, ignored=9). Score on covered mutants only: 99.78%. Adjusted (equivalent candidates excluded): 99.78%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/player/video-player.component.ts` | 98.4% | 62 | 1 | 0 |
| `src/lib/player/video-player.service.ts` | 100.0% | 63 | 0 | 0 |
| `src/lib/polling/video-state-polling.service.ts` | 100.0% | 23 | 0 | 0 |
| `src/lib/upload/video-upload.service.ts` | 100.0% | 176 | 0 | 0 |
| `src/lib/playback-config.service.ts` | 100.0% | 11 | 0 | 0 |
| `src/lib/player/caption-tracks.ts` | 100.0% | 4 | 0 | 0 |
| `src/lib/upload/video-upload.component.ts` | 100.0% | 11 | 0 | 0 |
| `src/lib/video-state-badge.component.ts` | 100.0% | 92 | 0 | 0 |
| `src/lib/video.service.ts` | 100.0% | 12 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/player/video-player.component.ts` — 1 surviving mutant

**Cluster 1** (lines 32): 1 mutant surviving — ArrayDeclaration×1

Sample mutation:
```diff
- readonly captions = input<CaptionTrack[]>([]);
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `video-player.component.ts:32`, not just truthiness.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-video.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
