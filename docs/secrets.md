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

Render the production deploy env (`.env.learn-wren`, consumed by `pnpm deploy:prod`):

```bash
pnpm secrets:render:deploy
```

Run a one-off command with secrets injected at the process boundary (never written to disk):

```bash
pnpm secrets:run -- <command>
```

`.env` is gitignored. Never commit it.

## Vault contract

Vault: `learnwren`. The table below mirrors `.env.tpl` — when you add a new
`op://...` reference there, add the matching row here.

| Item | Field | Env var rendered | Purpose | Required when |
|---|---|---|---|---|
| `Workspace` | `name` | `WORKSPACE_NAME` | Canary; non-secret value `learnwren-dev` proves the pipeline works | render-time sanity check |
| `Admin SDK Config` | `projectId` | `LEARNWREN_API_FIREBASE_PROJECT_ID` | Real Firebase project ID for the Admin SDK | `LEARNWREN_FIREBASE_TARGET=production` |
| `Web SDK Config` | `apiKey` | `LEARNWREN_FIREBASE_WEB_API_KEY` | Firebase Web API key used server-side by `FirebaseAuthRestClient` to verify passwords via the Identity Toolkit REST API (the web bundle has no Firebase client SDK) | `LEARNWREN_FIREBASE_TARGET=production` |
| `dev` | `LEARNWREN_VIDEO_SOURCE_BUCKET` | same | Cloud Storage bucket for raw instructor uploads | `NODE_ENV=production` |
| `dev` | `LEARNWREN_VIDEO_OUTPUT_BUCKET` | same | Cloud Storage bucket for transcoded HLS output | `NODE_ENV=production` |
| `dev` | `LEARNWREN_MATERIALS_BUCKET` | same | Cloud Storage bucket for lesson materials | `NODE_ENV=production` |
| `dev` | `LEARNWREN_GCP_PROJECT_ID` | same | GCP project hosting the Transcoder API and Pub/Sub topic | `LEARNWREN_VIDEO_TRANSCODER=gcp` |
| `dev` | `LEARNWREN_TRANSCODER_TOPIC` | same | Pub/Sub topic for Transcoder job events | `LEARNWREN_VIDEO_TRANSCODER=gcp` |
| `dev` | `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE` | same | Expected audience on the Pub/Sub push token | `LEARNWREN_VIDEO_TRANSCODER=gcp` |
| `dev` | `LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL` | same | Service account allowed to push transcoder events | `LEARNWREN_VIDEO_TRANSCODER=gcp` |
| `prod` | `SMTP_USER` | same | SES SMTP access key id (us-east-1; the SMTP password lives in Cloud Secret Manager, NOT in the vault/env) | production deploys |
| `prod` | `LEARNWREN_PUBLIC_URL` | same | Public origin: pins video-upload session origins + email links. Phased web.app → learnwren.com (see deployment.md) | production deploys |
| `prod` | `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE` | same | Exact push-endpoint URL (`<serviceConfig.uri>/api/internal/transcoder-events`) — printed by `tools/deploy/provision-pubsub.sh` | production deploys |

Outside production the video and materials stacks default to their
credential-free `fake` modes — none of the `dev/*` items are required for
`pnpm start` against the emulators.

The production deploy template is `.env.deploy.tpl` → rendered to `.env.learn-wren` (gitignored). Non-secret production values (bucket names, origins, project IDs) are committed literals in the template; only genuinely secret/varying values go through `op://` references.

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

## Service-account JSON for local-against-prod runs

When running `apps/api` locally against the **real** Firebase project (i.e., `LEARNWREN_FIREBASE_TARGET=production` outside of Firebase compute), the Admin SDK needs an explicit credential. The convention:

1. Generate a service-account JSON via the Firebase console: **Project Settings → Service accounts → Generate new private key.** Save the file to a path outside the repo, e.g. `~/.learnwren/service-account.json`. **Never** put this file in 1Password and **never** commit it.
2. Export the absolute path in your shell init (`~/.zshrc`, `~/.bashrc`, etc.):

   ```bash
   export FIREBASE_SERVICE_ACCOUNT_JSON_PATH="$HOME/.learnwren/service-account.json"
   ```

3. The api reads `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` only when `LEARNWREN_FIREBASE_TARGET=production`. In emulator mode (default) the variable is ignored.

If `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` is unset in production mode, the Admin SDK falls back to Application Default Credentials. ADC succeeds when running on Firebase Cloud Functions (the runtime injects them) and fails locally — the explicit JSON path is the standard local-against-prod escape hatch.
