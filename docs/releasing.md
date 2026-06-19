# Releasing

Learn Wren cuts releases with [`nx release`](https://nx.dev/features/manage-releases). A release is a single workspace-wide version derived from [Conventional Commits](https://www.conventionalcommits.org/): it bumps the version, regenerates `CHANGELOG.md`, commits, tags `v{version}`, pushes, and publishes a GitHub Release. **Nothing is published to a package registry** — this is an app monorepo, not a library publisher.

## How it is wired

Configured in [`nx.json`](../nx.json) under `release`:

- **`projects: ["web", "api"]`, `projectsRelationship: "fixed"`** — the two deployable apps share one version. They have no `package.json` of their own, so the version is written to the **root `package.json`** via `version.manifestRootsToUpdate: ["."]`.
- **`version.conventionalCommits: true`** — the bump (patch/minor/major) is computed from commit messages since the last `v*` tag. The current version is resolved from the latest git tag (`releaseTag.pattern: "v{version}"`), not from disk.
- **`changelog.workspaceChangelog.createRelease: "github"`** — one root `CHANGELOG.md` plus a GitHub Release. Per-project changelogs are off.

Commit-type → bump: `fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE:` → major. `docs/chore/ci/test/refactor/style/build` do not bump. Use commit **scopes** matching project names (`fix(web): …`) when you want attribution, though the bump is workspace-wide regardless.

> A baseline annotated tag `v0.0.0` was seeded so the conventional-commits resolver has a starting point. The first real release computes the bump from every commit after it.

## Cutting a release

Prerequisites: a clean working tree on `main`, in sync with `origin`, and the GitHub CLI authenticated (`gh auth status`). The `pnpm release` script injects a token from `gh auth token` automatically.

```bash
# 1. ALWAYS preview first — no changes are made.
pnpm release:dry

# 2. If the proposed version + changelog look right, cut it for real.
pnpm release
```

`pnpm release` will, in order: write the new version to `package.json`, update `pnpm-lock.yaml`, regenerate `CHANGELOG.md`, `git commit`, `git tag v{version}`, `git push` (commit + tag) to `origin`, and create the GitHub Release with the changelog as its body.

## Releasing from CI

A manually-triggered GitHub Actions workflow, [`.github/workflows/release.yml`](../.github/workflows/release.yml), runs the same `nx release` in CI using the built-in `GITHUB_TOKEN` — no local `gh` login required.

- **Trigger it** from the repo's **Actions → Release → Run workflow**, or `gh workflow run release.yml`.
- **Inputs:** `dry_run` (preview only — no commit/tag/push/release) and `specifier` (a `patch`/`minor`/`major`/`x.y.z` override; blank = infer from conventional commits).
- It checks out full history + tags (`fetch-depth: 0`), commits as `github-actions[bot]`, and pushes the release commit + tag back to `main`.
- The job needs `contents: write` (declared in the workflow) and to be able to push to `main` — if `main` has branch protection that blocks the Actions bot, either allow it or stick to the local `pnpm release`.

## Notes & gotchas

- **Preview is mandatory.** Tags and GitHub releases are awkward to undo — `pnpm release:dry` first, every time.
- **The push is real.** `nx release` pushes the release commit and tag to `origin`. Make sure `main` is where you want it before running.
- **`gh` token.** If you run `nx release` directly (not via `pnpm release`), export a token yourself: `GITHUB_TOKEN=$(gh auth token) pnpm nx release`. Without it the version/tag/commit succeed but the GitHub Release step fails.
- **No bump = no release.** If only non-bumping commits (docs/chore/…) landed since the last tag, `nx release` reports "no changes" and does nothing.
- **Override the version** when needed: `pnpm nx release patch|minor|major` or `pnpm nx release 1.2.3` skips conventional-commits inference.
