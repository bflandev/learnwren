# Deployment

How to deploy Learn Wren to Firebase. For local development see
[`development.md`](./development.md); for secrets see [`secrets.md`](./secrets.md).

> This slice wires the deploy mechanism. The first real deploy has not been
> performed yet — see [Not done yet](#not-done-yet) for the remaining steps.

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
   `pnpm secrets:render` — see [Required environment variables](#required-environment-variables).

## Deploy commands

Full deploy (rules + hosting + functions):

```bash
pnpm deploy
# expands to:
# firebase deploy --config firebase.deploy.json -P production
```

Deploy everything except hosting (useful for API-only changes):

```bash
pnpm deploy:preview
# expands to:
# firebase deploy --config firebase.deploy.json -P production --except hosting
```

The `predeploy` hooks in `firebase.deploy.json` automatically:

1. Build the NestJS API: `pnpm exec nx build api --configuration=production`
2. Patch the functions package: `node tools/deploy/patch-functions-package.mjs`
   — ensures `dist/apps/api/package.json` has `"main": "main.js"`,
   `"engines": {"node": "22"}`, and `"firebase-functions"` in dependencies.
3. Build the Angular SPA: `pnpm exec nx build web --configuration=production`

## Required environment variables

The following variables must be set in the Cloud Functions runtime (via
`firebase functions:config:set` or Firebase console → Functions → Runtime
environment variables) when deploying against the real project.

### Always required in production

| Variable | Purpose |
| :--- | :--- |
| `NODE_ENV` | Must be `production`. Activates production guards (rejects fake adapters, enforces CORS). |
| `LEARNWREN_FIREBASE_TARGET` | Must be `production`. Switches Admin SDK from emulator to real project. |
| `LEARNWREN_API_FIREBASE_PROJECT_ID` | Real Firebase project ID (Admin SDK). |
| `FIREBASE_WEB_API_KEY` | Firebase Web API key used by `FirebaseAuthRestClient` for password verification. |
| `LEARNWREN_CORS_ORIGINS` | Comma-separated list of allowed CORS origins (e.g. `https://your-project.web.app`). The API **refuses to start** if this is unset in production. |

### Email transport

| Variable | Purpose | Default |
| :--- | :--- | :--- |
| `LEARNWREN_EMAIL_TRANSPORT` | `smtp` for real email; `console` logs to function output | `console` |
| `LEARNWREN_EMAIL_FROM` | Sender address for auth/notification emails | required when `LEARNWREN_EMAIL_TRANSPORT=smtp` |
| `SMTP_HOST` | SMTP hostname | required when transport is `smtp` |
| `SMTP_PORT` | SMTP port | required when transport is `smtp` |
| `SMTP_USER` | SMTP username | required when transport is `smtp` |
| `SMTP_PASS` | SMTP password | required when transport is `smtp` |
| `LEARNWREN_PUBLIC_URL` | Base URL used when constructing email links (e.g. password-reset, email-verify, course-notification). Defaults to `http://localhost:4200` which is wrong in production. | required in production |

### Video transcoding (GCP Transcoder API)

These are all required when `LEARNWREN_VIDEO_TRANSCODER=gcp` (the production default).

| Variable | Purpose |
| :--- | :--- |
| `LEARNWREN_VIDEO_SOURCE_BUCKET` | Cloud Storage bucket for raw instructor video uploads |
| `LEARNWREN_VIDEO_OUTPUT_BUCKET` | Cloud Storage bucket for transcoded HLS output |
| `LEARNWREN_GCP_PROJECT_ID` | GCP project hosting the Transcoder API and Pub/Sub topic |
| `LEARNWREN_TRANSCODER_LOCATION` | GCP region for the Transcoder API (e.g. `us-central1`) |
| `LEARNWREN_TRANSCODER_TOPIC` | Pub/Sub topic for Transcoder job-complete events |
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

### Storage — profile pictures

| Variable | Purpose |
| :--- | :--- |
| `LEARNWREN_PICTURE_BUCKET` | Cloud Storage bucket for user profile pictures |
| `LEARNWREN_PICTURE_PUBLIC_BASE_URL` | Public base URL for picture delivery |

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
- **Pub/Sub topics or IAM bindings** — set up once in the GCP console per
  [`docs/operations/transcoder-pubsub-setup.md`](./operations/transcoder-pubsub-setup.md).
- **GCS bucket CORS configuration** — see below.

## Not done yet

The following items must be completed before the first real production deploy:

1. **Cloud credentials**: `firebase login` with a project-owner account and
   `firebase use production` to select the project alias. Populate all required
   env vars (see above) in the Cloud Functions runtime configuration.

2. **GCS CORS for video segments (EP-03 pre-existing open item)**:
   In production, HLS video segments are served from `LEARNWREN_VIDEO_OUTPUT_BUCKET`
   as signed URLs (`storage.googleapis.com`). These are cross-origin fetches by
   the browser. The output GCS bucket needs a CORS policy allowing the hosting
   origin. The recommended approach is anonymous (`withCredentials: false`) segment
   fetches — hls.js in `libs/web-video` already scopes `withCredentials` to
   same-origin `/api` requests only, and `<video crossorigin="anonymous">` is set,
   so only a simple (non-credentialed) CORS policy is needed on the bucket. Verify
   real cross-origin segment playback against the actual bucket on the first deploy.
   See also [security.md § CORS posture](./security.md#cors-posture--audited-2026-05-31).

3. **Custom domain** (optional): Firebase Hosting serves the app at
   `your-project.web.app` by default. A custom domain requires DNS verification
   in the Firebase console and updating `LEARNWREN_CORS_ORIGINS` to include it.

4. **CI auto-deploy**: The current `.github/workflows/ci.yml` does not run
   `pnpm deploy` on merge to `main`. Wiring a deploy job requires storing
   `FIREBASE_TOKEN` (or a service-account JSON) as a CI secret and adding a
   `firebase deploy` step after the existing gates pass.
