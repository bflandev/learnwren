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

## Branch protection on `main`

`main` is governed by the **"Protect main"** repository ruleset: changes require a pull request, and force-pushes and deletion are blocked. The **Repository admin** role is in the ruleset's bypass list, so the maintainer can still push directly (this is how `pnpm release` works — see below). Any future collaborators are funnelled through PRs.

## Releasing from CI

The manually-triggered workflow [`.github/workflows/release.yml`](../.github/workflows/release.yml) runs `nx release` from the Actions tab (or `gh workflow run release.yml`), with `dry_run` and `specifier` inputs.

> **On this repo, use the CI workflow only for `dry_run` previews.** A real CI release pushes the version commit + tag to `main`, but the workflow authenticates as `github-actions[bot]`, which **cannot** be added to the ruleset bypass list on a personal (non-org) repo. So a non-dry-run CI trigger would fail at the push step. Cut real releases locally with `pnpm release` (you push as the admin, who bypasses the ruleset).
>
> To enable full CI releases later, give the workflow a fine-grained Personal Access Token (Contents: read/write) as an Actions secret and have `actions/checkout` use it — pushes then authenticate as you (admin → bypass), and the bot limitation no longer applies.

## Notes & gotchas

- **Preview is mandatory.** Tags and GitHub releases are awkward to undo — `pnpm release:dry` first, every time.
- **The push is real.** `nx release` pushes the release commit and tag to `origin`. Make sure `main` is where you want it before running.
- **`gh` token.** If you run `nx release` directly (not via `pnpm release`), export a token yourself: `GITHUB_TOKEN=$(gh auth token) pnpm nx release`. Without it the version/tag/commit succeed but the GitHub Release step fails.
- **No bump = no release.** If only non-bumping commits (docs/chore/…) landed since the last tag, `nx release` reports "no changes" and does nothing.
- **Override the version** when needed: `pnpm nx release patch|minor|major` or `pnpm nx release 1.2.3` skips conventional-commits inference.
