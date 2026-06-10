# Deployment

How to deploy Learn Wren to Firebase. For local development see
[`development.md`](./development.md); for secrets see [`secrets.md`](./secrets.md).

> Deploy mechanism + production runbook — see [Production setup status](#production-setup-status) for what is scripted vs. manual. The first real deploy has not been performed yet.

## Overview

The build output is deployed to two Firebase targets:

| Layer | Firebase product | Source |
| :--- | :--- | :--- |
| Angular SPA | Firebase Hosting | `dist/apps/web/browser/` |
| NestJS API | Cloud Functions (nodejs22) | `dist/apps/api/` |

Firebase Hosting serves all static assets and proxies `/api/**` requests to the
`api` Cloud Function. All other paths fall through to `index.html` (Angular
client-side routing). No Firebase Admin SDK or Firestore/Storage data is deployed
by `firebase deploy` — schema-less Firestore needs no migrations.

The configuration that governs what gets deployed is **`firebase.deploy.json`**
(not `firebase.json`, which governs emulator runs). A static guard in
`apps/api-e2e/src/firestore-rules.e2e-spec.ts` verifies that
`firebase.deploy.json` references the correct, deploy-safe rules files.

## Prerequisites

One-time setup for the Firebase project:

1. **Firebase CLI** installed globally or via `pnpm exec firebase`.
2. **Logged in**: `firebase login` (or `firebase login:ci` for non-interactive
   environments).
3. The project alias `production` is configured in `.firebaserc`. Verify with
   `firebase use`.
4. The Firebase project is on the **Blaze** plan (Cloud Functions require it).
5. **Authentication**, **Firestore**, **Cloud Storage**, and **Cloud Functions**
   are all enabled in the Firebase console for the project.
6. The 1Password vault items are populated and `.env` has been rendered via
   `pnpm secrets:render` — see [Required environment variables](#required-environment-variables);
   for production deploys additionally render the functions runtime env via
   `pnpm secrets:render:deploy` (template `.env.deploy.tpl` → gitignored `.env.learn-wren`).

## Deploy commands

Full deploy (rules + hosting + functions):

```bash
pnpm deploy:prod
# expands to:
# firebase deploy --config firebase.deploy.json -P production
```

The script is named `deploy:prod` because `deploy` is a pnpm builtin that shadows package scripts (`pnpm deploy` exits with `ERR_PNPM_NOTHING_TO_DEPLOY` without ever running firebase).

Deploy everything except hosting (useful for API-only changes):

```bash
pnpm deploy:preview
# expands to:
# firebase deploy --config firebase.deploy.json -P production --except hosting
```

The `predeploy` hooks in `firebase.deploy.json` automatically:

1. Build the NestJS API: `pnpm exec nx build api --configuration=production`
2. Patch the functions package: `node tools/deploy/patch-functions-package.mjs --require-deploy-env`
   — ensures `dist/apps/api/package.json` has `"main": "main.js"`,
   `"engines": {"node": "22"}`, and `"firebase-functions"` in dependencies;
   copies `.env.learn-wren` into `dist/apps/api` (fatal if missing) and writes
   the emulator-only `.secret.local`.
3. Build the Angular SPA: `pnpm exec nx build web --configuration=production`

## Required environment variables

The following variables must be present in the Cloud Functions runtime when
deploying against the real project. **The only supported mechanism for gen2
functions is a dotenv file in the functions source directory**: render
`.env.learn-wren` from 1Password (`pnpm secrets:render:deploy`, template
`.env.deploy.tpl`), and the deploy predeploy chain copies it into
`dist/apps/api` after the build (`tools/deploy/patch-functions-package.mjs
--require-deploy-env` — fatal if the file is missing).

Do **not** use `firebase functions:config:set` (legacy Runtime Config: never
exposed as env vars, blocked in current firebase-tools, service shuts down
March 2027) and do **not** set env vars in the Cloud console — `firebase
deploy` replaces the function's entire env-var map on every deploy, silently
wiping console-set values.

Secrets (`SMTP_PASS`) live in Cloud Secret Manager: `firebase
functions:secrets:set SMTP_PASS`, bound via the `secrets:` option in
`apps/api/src/main.ts`. Secret values are pinned at deploy time — rotation
requires a redeploy. Env keys must never start with the reserved prefixes
`FIREBASE_`, `X_GOOGLE_` or `EXT_` (a reserved key aborts the deploy).

### Always required in production

| Variable | Purpose |
| :--- | :--- |
| `NODE_ENV` | Must be `production`. Activates production guards (rejects fake adapters, enforces CORS). |
| `LEARNWREN_FIREBASE_TARGET` | Must be `production`. Switches Admin SDK from emulator to real project. |
| `LEARNWREN_API_FIREBASE_PROJECT_ID` | Real Firebase project ID (Admin SDK). |
| `LEARNWREN_FIREBASE_WEB_API_KEY` | Firebase Web API key used by `FirebaseAuthRestClient` for password verification. |
| `LEARNWREN_CORS_ORIGINS` | Comma-separated list of allowed CORS origins (e.g. `https://your-project.web.app`). The API **refuses to start** if this is unset in production. |

### Email transport

| Variable | Purpose | Default |
| :--- | :--- | :--- |
| `LEARNWREN_EMAIL_TRANSPORT` | `smtp` for real email; `console` logs to function output | `console` |
| `LEARNWREN_EMAIL_FROM` | Sender address for auth/notification emails | required when `LEARNWREN_EMAIL_TRANSPORT=smtp` |
| `SMTP_HOST` | SMTP hostname | required when transport is `smtp` |
| `SMTP_PORT` | SMTP port — use 587 (STARTTLS). For SES the password is region-derived from the IAM secret key, not the secret key itself; credentials are per-region. | required when transport is `smtp` |
| `SMTP_USER` | SMTP username | required when transport is `smtp` |
| `SMTP_PASS` | SMTP password | required when transport is `smtp` |
| `LEARNWREN_PUBLIC_URL` | Base URL for email links AND the pinned origin of GCS resumable video-upload sessions — browser video uploads only succeed from a page origin byte-equal to this value (bucket CORS does not override the session origin). Phased: https://learn-wren.web.app until the custom domain serves, then https://learnwren.com. | required in production |

### Video transcoding (GCP Transcoder API)

These are all required when `LEARNWREN_VIDEO_TRANSCODER=gcp` (the production default).

| Variable | Purpose |
| :--- | :--- |
| `LEARNWREN_VIDEO_SOURCE_BUCKET` | Cloud Storage bucket for raw instructor video uploads |
| `LEARNWREN_VIDEO_OUTPUT_BUCKET` | Cloud Storage bucket for transcoded HLS output |
| `LEARNWREN_GCP_PROJECT_ID` | GCP project hosting the Transcoder API and Pub/Sub topic |
| `LEARNWREN_TRANSCODER_LOCATION` | GCP region for the Transcoder API (e.g. `us-central1`) |
| `LEARNWREN_TRANSCODER_TOPIC` | Pub/Sub topic for Transcoder job-complete events — must be the **full resource path** `projects/<project>/topics/<name>` (the code passes it raw into `JobConfig.pubsubDestination`) |
| `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE` | Expected `aud` claim on the Pub/Sub push token |
| `LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL` | Service-account email allowed to push Transcoder events |

### Storage — lesson materials

| Variable | Purpose |
| :--- | :--- |
| `LEARNWREN_MATERIALS_BUCKET` | Cloud Storage bucket for lesson materials (uploads + downloads) |

### Storage — cover images

| Variable | Purpose |
| :--- | :--- |
| `LEARNWREN_COVER_BUCKET` | Cloud Storage bucket for course cover images |
| `LEARNWREN_COVER_PUBLIC_BASE_URL` | Public base URL for cover image delivery (e.g. `https://storage.googleapis.com/<bucket>`) |
| `LEARNWREN_COVER_STORAGE` | Must be `firebase` in production (defaults to it; explicit `fake` is rejected at boot). |

### Storage — profile pictures

| Variable | Purpose |
| :--- | :--- |
| `LEARNWREN_PICTURE_BUCKET` | Cloud Storage bucket for user profile pictures |
| `LEARNWREN_PICTURE_PUBLIC_BASE_URL` | Public base URL for picture delivery |
| `LEARNWREN_PICTURE_STORAGE` | Must be `firebase` in production (defaults to it; explicit `fake` is rejected at boot). |

### Optional / tuning

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES` | `30` | Minutes before a transcoding job is considered stuck |
| `LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC` | `14400` | TTL (seconds) for HLS manifest signed URLs |
| `LEARNWREN_MATERIALS_UPLOAD_URL_TTL_SEC` | `900` | TTL for materials upload signed URLs |
| `LEARNWREN_MATERIALS_DOWNLOAD_URL_TTL_SEC` | `900` | TTL for materials download signed URLs |

## Smoke test harness

Before deploying you can verify the deploy wiring locally (no cloud credentials,
no real Firebase project, different ports from the dev emulators):

```bash
# Build first (if you haven't already):
pnpm exec nx build api --configuration=production --skip-nx-cache
node tools/deploy/patch-functions-package.mjs
pnpm exec nx build web --configuration=production --skip-nx-cache

# Boot emulators on non-default ports and run assertions:
pnpm smoke
```

The smoke harness (`tools/deploy/smoke.mjs`) boots Firebase emulators on ports
that do not conflict with the long-lived dev emulators:

| Service | Smoke port |
| :--- | :--- |
| Hosting | 7050 |
| Functions | 7051 |
| Firestore | 7080 |
| Auth | 7099 |
| Storage | 7199 |

Five assertions are verified (`tools/deploy/smoke-assert.mjs`):

- `GET /` returns `200 text/html` (SPA index).
- `GET /some/spa/route` returns `200 text/html` (SPA fallback rewrite).
- `GET /api/health` returns `200 {"status":"ok"}` through the hosting rewrite to
  the Cloud Function.
- `index.html` has a `no-cache` `Cache-Control` header.
- Hashed JS bundles have a `public, max-age=31536000, immutable` header.

The smoke project is `demo-learnwren-smoke`; it does not touch the real Firebase
project.

## How the Cloud Function is wired

`apps/api/src/main.ts` is dual-mode:

- **Listen mode** (default): `NestFactory.create(AppModule)` binds to `PORT`
  (default `3333`). This is unchanged from the original behavior — `pnpm start`,
  `pnpm nx serve api`, and the api-e2e Playwright `webServer` all use it.
- **Functions mode**: activated when `K_SERVICE` (real Cloud Functions) or
  `FUNCTIONS_EMULATOR` (firebase-tools emulator) is set. Exports
  `module.exports.api` as an `onRequest` v2 HTTPS function. Nest is initialized
  lazily on the first request; the initialization Promise is memoized to avoid
  duplicate `NestFactory.create` calls during concurrent cold starts.

`apps/api/webpack.config.js` sets `output.libraryTarget: 'commonjs2'` so the
webpack bundle exposes its entry module's `module.exports` as the Node.js
`require()` return value — without this, the functions emulator's
`require(bundlePath).api` returns `undefined`.

## What `firebase.deploy.json` does NOT do

`firebase.deploy.json` does not deploy or touch:

- **Firestore data** — schema-less, no migrations needed.
- **Firebase Authentication configuration** — managed in the console.
- **Pub/Sub topics or IAM bindings** — provisioned once per environment by
  `tools/deploy/provision-pubsub.sh` per
  [`docs/operations/transcoder-pubsub-setup.md`](./operations/transcoder-pubsub-setup.md).
- **GCS bucket CORS configuration** — see below.

## Production setup status

The deploy mechanism and the production runbook live in
`docs/superpowers/specs/2026-06-10-production-deploy-and-custom-domain-design.md`
(phases A–E: provisioning → first deploy → Pub/Sub wiring → custom domain →
email). One-time provisioning is scripted:

- `tools/deploy/provision-buckets.sh` — 5 GCS buckets, CORS, IAM (incl. the
  runtime SA's `iam.serviceAccountTokenCreator` self-grant required for v4
  signed-URL minting), Transcoder service-agent grants.
- `tools/deploy/provision-pubsub.sh` — transcoder-events topic + OIDC push
  subscription (gen2: `roles/run.invoker`, endpoint/audience from
  `serviceConfig.uri`). Run it **after** the first deploy.

Still manual: Firebase console custom-domain wizard + Route 53 records
(see below), default Firebase Storage bucket provisioning (required once or
the `storage` rules deploy target errors), SES identity/production-access in
the AWS console, and CI auto-deploy (deliberately deferred — deploys are
manual `pnpm deploy:prod`).

## Custom domain (learnwren.com via Route 53)

The site serves at `https://learnwren.com` (apex primary); `www.learnwren.com`
301-redirects to the apex. Default domains (`learn-wren.web.app`,
`learn-wren.firebaseapp.com`) keep serving forever — Hosting cannot disable
or host-redirect them — so both stay in `LEARNWREN_CORS_ORIGINS` and the
bucket CORS policies.

1. **Pre-flight the Route 53 zone**: no AAAA records at apex/`www` (any AAAA
   blocks SSL provisioning entirely), no A/CNAME pointing at other providers;
   if CAA records exist they must allow **both** `letsencrypt.org` and
   `pki.goog`; Route 53 allows one TXT record *set* per name — Firebase's
   ownership TXT value merges into the existing apex TXT set if there is one.
2. Firebase console → Hosting → **Add custom domain** → `learnwren.com`
   (Quick Setup): add the ownership TXT (permanent — it authorizes cert
   renewals; never delete it) and the console-provided A record at the apex.
   Use TTL 300 during setup. Copy the console's values; do not assume IPs.
3. **Add custom domain** → `www.learnwren.com` with "redirect to
   learnwren.com": add its own A record (same console-provided value).
4. Wait for cert provisioning (usually hours, up to 24 h; an invalid-cert
   interstitial while provisioning is documented-normal).
5. Verify: full walkthrough on `https://learnwren.com` **including video
   playback** (the page origin changes; the bucket CORS policies already list
   it), and `www` → apex 301.
6. Flip `LEARNWREN_PUBLIC_URL` to `https://learnwren.com` (1Password `prod`
   item → `pnpm secrets:render:deploy` → `pnpm deploy:preview`) and verify a
   video upload on the custom domain — uploads are origin-pinned to this value.
