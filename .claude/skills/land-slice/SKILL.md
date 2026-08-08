---
name: land-slice
description: Use when a slice is implemented and ready to land in Learn Wren — the pre-merge gates, the docs sync (README, USER_GUIDE, quality reports), and the memory record. Use before merging, not after.
---

# Landing a Slice (Learn Wren)

The git mechanics live in the **worktree-flow** skill. This is everything either side of them, in order. Skipping the docs step is how README stops being the authoritative feature record.

## 1. Gates (all from the worktree, all green)

```bash
pnpm exec nx affected -t lint test typecheck build
pnpm exec nx typecheck web            # vitest does NOT typecheck; run this explicitly
pnpm exec nx run web-e2e:a11y         # the WCAG gate — see run-e2e for ports/emulators
pnpm e2e                              # api-e2e + web-e2e on fresh emulators
```

Mutation gate only if the slice added source to a gated lib (see **mutation-round**).

## 2. Docs sync — same commit as the code, before the merge

- **`README.md`** — the authoritative feature record. Add the slice to its epic bullet: what shipped, the date, the story ID, the endpoints, and the **scope cuts**. Say plainly when a story or epic is now complete.
- **`docs/USER_GUIDE.md`** — the user-facing behaviour and what is deferred.
- **`docs/quality/spec-drift-report.md`** — reconcile if the slice changed spec'd behaviour.
- **`docs/quality/mutation-report-<lib>.md`** — only if a mutation round ran.
- Specs keep their DRAFT banner; flip the plan's checkboxes as they complete.
- A `docs/superpowers/summaries/*-summary.md` is optional — the practice lapsed after 2026-05-30, and the README bullet plus the memory record carry the same load. Write one only if asked.

## 3. Merge

Per **worktree-flow**: status-check, `--no-ff` merge from the main checkout, then remove the worktree — as separate commands, never chained.

## 4. Memory record (after the merge, with the merge SHA)

One file in `~/.claude/projects/-Volumes-Artie-Storage-github-repos-learnwren/memory/`, plus one line in `MEMORY.md`. What earns a place:

- The merge SHA and what the slice closed.
- **New reusable seams** — named, with "route through this, don't re-derive".
- **Deferred / accepted risks**, so the next review doesn't re-report them.
- Gotchas that cost real time (emulator, worktree, tooling), linked as `[[other-memory]]`.

Not: code structure, the diff, or anything git and README already say.

## Common mistakes

| Mistake | Reality |
|---|---|
| Docs sync as a follow-up commit after the merge | It gets forgotten. README is the feature record — it lands with the code. |
| README bullet listing only what works | The scope cuts are the useful half; without them the next slice re-litigates them. |
| Memory entry written before the merge | It needs the merge SHA. Write it last. |
| Trusting a green `nx test` as done | It doesn't typecheck. Run `nx typecheck` too. |
