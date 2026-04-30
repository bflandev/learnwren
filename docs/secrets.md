# Secrets and 1Password

`learnwren` keeps secrets out of the repo using the [1Password CLI](https://developer.1password.com/docs/cli/). `.env.tpl` (committed) references `op://...` paths; `.env` (gitignored) is rendered locally on demand.

## Prerequisites

- 1Password CLI ≥ 2.x installed and on `PATH`.
- `op signin` to an account that has access to the `learnwren` vault.
- Membership in the `learnwren` vault.

## Daily workflow

Render `.env` from `.env.tpl`:

```bash
pnpm secrets:render
```

Re-run after rotating a secret or adding a new entry to `.env.tpl`.

Run a one-off command with secrets injected at the process boundary (never written to disk):

```bash
pnpm secrets:run -- <command>
```

`.env` is gitignored. Never commit it.

## Vault contract

Vault: `learnwren`

| Item | Field | Purpose | Required by |
|---|---|---|---|
| `Workspace` | `name` | Canary; value `learnwren-dev`; proves the pipeline works | this spec |

The `Workspace.name` field is referenced from `.env.tpl` as `op://learnwren/Workspace/name`. Future entries land here as later specs introduce them.

## Adding a secret

1. Create the secret in the `learnwren` vault under a clearly-named item.
2. Add a line to `.env.tpl` of the form `MY_VAR=op://learnwren/Item/field`.
3. Append a row to the vault contract table above describing what the secret is and which spec needs it.
4. Commit `.env.tpl` and this file (`docs/secrets.md`). **Never** commit `.env`.

## Troubleshooting

- **`op: not signed in`** — run `op signin` and try again.
- **`pnpm secrets:render` produces an empty `.env` or only comments** — check that the referenced items exist in the `learnwren` vault and that your account has read access.
- **`WORKSPACE_NAME` is unset after render** — confirm the `Workspace` item has a field literally named `name` (case-sensitive) holding the value `learnwren-dev`.
- **macOS desktop integration**: `op` CLI inside subprocess shells (e.g., agent-driven automation, IDE terminals) may not see the desktop app's session even when Settings → Developer → "Integrate with 1Password CLI" is enabled. If `op whoami` fails in a subprocess but works in your interactive terminal, run `pnpm secrets:render` from your interactive terminal instead.
