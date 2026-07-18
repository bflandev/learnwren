---
name: worktree-flow
description: Use when starting isolated feature work, creating or finishing a git worktree, dispatching subagents into a worktree, or when a worktree build serves stale dist output or work lands on main by accident.
---

# Worktree Flow (Learn Wren)

All feature work happens in a worktree branched from local HEAD (local main is far ahead of origin — never branch from origin/main), landed via a local `--no-ff` merge.

## Create

```bash
git worktree add ../learnwren-<topic> -b <type>/<topic> HEAD
ln -s /Volumes/Artie-Storage/github-repos/learnwren/node_modules ../learnwren-<topic>/node_modules
```

## Rules while working

- **Never `git add -A` or `git add .`** — the node_modules symlink evades .gitignore and will be committed. Add files explicitly by path.
- **Subagents drift back to the main checkout.** Every dispatched command must carry the prefix `cd /Volumes/…/learnwren-<topic> && pwd && ` — per command, not per session. Without it, subagents have committed to main.
- Nx builds in a worktree can serve **stale `.d.ts`/dist from the parent** (or poison the parent's `dist/out-tsc`). Symptom: type errors about exports that plainly exist, or a build output missing code you just wrote. Recovery: delete `dist/out-tsc` (and `dist/apps/<app>` if affected), rerun with `NX_DAEMON=false`. Recurs on long subagent runs.
- Orphaned `nx serve`/emulator processes from other worktrees survive `TaskStop` — probe ports before starting servers (see the run-e2e skill).

## Finish

Do these as separate commands — never chain commit+merge+remove into one line (a mid-chain failure leaves half-merged state):

```bash
git -C ../learnwren-<topic> status --porcelain   # MUST be empty before proceeding
git merge --no-ff <type>/<topic> -m "Merge <branch>: <summary>"   # from the MAIN checkout
git worktree remove ../learnwren-<topic>          # plain remove; --force only after reading status yourself
git branch -d <type>/<topic>
```

## Common mistakes

| Mistake | Reality |
|---|---|
| Branch from origin/main | Local main is far ahead. Always `HEAD`. |
| `git add -A` "it's gitignored" | The symlink is not. Explicit paths only. |
| One `cd` at subagent start | Shell cwd resets between commands. Prefix every command. |
| `worktree remove --force` to save a step | It destroys uncommitted work. Status-check first. |
| Debugging "impossible" missing-export type errors | It's the stale-dist hazard. Nuke `dist/out-tsc` + `NX_DAEMON=false` before debugging code. |
