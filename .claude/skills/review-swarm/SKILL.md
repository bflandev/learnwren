---
name: review-swarm
description: Use when running a multi-agent review or bug hunt over Learn Wren — a whole-repo sweep, a pre-deploy readiness pass, or a review of the diff since the last review-clean commit. Also use before reporting a finding, to check it isn't already an accepted risk.
---

# Review Swarm (Learn Wren)

Rounds of parallel reviewers, each round narrower than the last, until findings converge. Trend across the 2026-07-12 hunt: 8 → 24 → 17 → 2. Stop when two lenses in a round return nothing.

## Round shape

1. **Scope it.** Either the diff since the last review-clean SHA, or whole files for a named subsystem. Say which — a "whole repo" prompt over a diff-sized scope wastes the round.
2. **Dispatch 3–5 reviewers in parallel, one lens each**, in the same message. Lenses that have paid off: security, data lifecycle, concurrency/idempotency, journey contracts, NestJS/API, Angular/web, and one unconstrained sweep. Repeat a lens across rounds only if it found something.
3. **Verify each finding against the real code path before fixing.** Reviewers hallucinate plausible bugs, and one confidently argued a fix that would have broken playback (see accepted risks). Read the file; don't fix from the report.
4. **Fix in a worktree** (see **worktree-flow**). Parallel fix agents can share one worktree only on disjoint libs.
5. **Re-run gates**, then a fresh round on the round's own diff.

Reviewers need the `cd <worktree> && pwd &&` prefix on every command or they drift back to main.

## Before reporting anything

Check the seam exists first — most "missing" logic is already centralised. Route through, never re-derive: `nowIso()`, `evaluatePasswordPolicy()`, `handleException()`, `PasswordVerificationService`, `revokeAllUserSessions`, `runTransactionWithRetry`, `readStoredUserProfiles`, `getUserInTxn`, `CategoriesRepository.getInTxn`, `TxnLessonLister`. New public controllers belong in `PUBLIC_ALLOWLIST`, not outside the guard-coverage spec.

## Accepted risks — do NOT re-report

| Finding | Why it stands |
|---|---|
| "Shorten the playback signed-URL TTL" | **Wrong.** `manifest.service.ts` signs every segment into the VOD playlist once, and hls.js never reloads a playlist with `#EXT-X-ENDLIST`. A flat TTL cut breaks the tail of any long video. Real fix = per-duration TTL or an auth-checked segment proxy. |
| No self / last-admin guard *before* suspend | Guarded inside the transaction, deliberately. |
| Cover / profile-picture upload-vs-remove residual race | Ordering fixed; a full fix needs versioned object names. |
| Materials complete 409-on-repeat | Locked e2e contract, mirrors the video pipeline. |
| Redundant `X-Frame-Options` alongside CSP `frame-ancestors` | Kept for legacy browsers. |
| Landing page placeholder stats and $9/mo pricing | Matches the approved design spec. |
| 500-for-visibility on invariant Errors in video finalize | Deliberate. |
| web-e2e editor timeouts on a cold first build | Environment, not code. Rerun. |

## Prove the invariant tests fail

Any guard-coverage or architectural-invariant spec added by a swarm must be shown failing first — inject a temporary violating file, watch the spec fail with the intended message, remove it. An invariant test that has never failed proves nothing.

## Common mistakes

| Mistake | Reality |
|---|---|
| Fixing straight from the report | Verify the path in the code first. Several findings have been fiction. |
| Same lenses every round | Rotate. Two of five round-3 lenses returning zero is the convergence signal. |
| Counting a round clean without fresh emulators | Check `ps` for orphaned `emulators:exec` and its `--project` id (see **run-e2e**). |
| Re-opening an accepted risk | The table above exists so the argument happens once. |
