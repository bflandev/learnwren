> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# US-09-04: Open-Source and Self-Hosting — Slice A Design

**Date:** 2026-09-25
**Story:** [US-09-04](../../epics/09-non-functional-requirements.md#us-09-04-open-source-and-self-hosting) (EP-09, Non-Functional Requirements)
**Status:** Slice A shipped (Docker Compose packaging of emulator mode). *Superseded by D3c (2026-10-02): Compose no longer runs the emulators, `network_mode`, `docker/firebase.json` and `LEARNWREN_ADMIN_BIND` are gone; see `docs/self-hosting.md`.*

---

## 1. Why this slice, and why this shape

US-09-04 was the last wholly-unstarted story in the spec. Its five acceptance
criteria split cleanly:

| AC | Before this slice | After Slice A |
| :--- | :--- | :--- |
| OSI-approved licence | Met (AGPL-3.0-or-later, `LICENSE`) | Met |
| Docker Compose, single command | Not started | **Met**: `docker compose up -d` |
| README + deployment guide (prereqs, config, first run) | Partial (`docs/deployment.md` covers Firebase only) | **Met**: `docs/self-hosting.md` |
| No proprietary third-party services required | Not met: Firestore, Firebase Auth, Cloud Storage, GCP Transcoder | **Partially met** — see §4 |
| Documented `.env.example` | Not started | **Met**: `.env.example` |

Two options were weighed. **Option A** packages the platform's existing
emulator mode (Firebase Emulator Suite + the in-memory fake adapters) as the
self-host target. **Option B** builds real self-hosted adapters behind the
existing seams (MinIO for storage, ffmpeg for AES-128 HLS, a replacement for
Firebase Auth and Firestore) and amends `TECHNICAL_ARCHITECTURE.md`. Option B
is several slices and an architecture change; Option A is a packaging slice
with no application-code change and gets four of five ACs to met. Option A was
chosen as Slice A, with the fourth AC amended in the epic to record what still
depends on proprietary services.

## 2. Current state (surveyed at `2423f63`)

- Emulator mode needs **no configuration**: with `NODE_ENV` unset the api
  defaults every adapter to its fake (transcoder, playback storage, source
  probe, cover, picture, materials) and the Admin SDK to `127.0.0.1` emulator
  hosts (`libs/api-firebase/src/lib/firebase-admin.module.ts`).
- The web app uses no Firebase client SDK; it talks only to `/api`. Session
  auth is a cookie set by the api.
- One browser-to-emulator hop exists: video upload. The api mints a resumable
  upload URL via the Admin SDK, and the Storage emulator builds that URL from
  the request's `Host` header (`firebase-tools` `EmulatorRegistry.url`). The
  browser therefore uploads to whatever host the *api* used to reach the
  emulator.
- `LEARNWREN_PUBLIC_URL` drives verification/reset/unlock continue URLs, the
  upload session's CORS origin, and notification links.
- The Nx api build emits `dist/apps/api/package.json` listing only runtime
  dependencies (`generatePackageJson: true`), which is what the deploy path
  already relies on.

## 3. Design

Five new files plus docs; no application code touched.

| File | Role |
| :--- | :--- |
| `Dockerfile` | Four targets: `builder` (pnpm install + `nx run-many -t build -p web,api`), `api` (node:22-slim, `npm install --omit=dev` from the emitted package.json), `web` (nginx:alpine + the browser build), `emulators` (eclipse-temurin 21 JRE with the node binary copied in, `firebase-tools` pinned to the workspace's `15.16.0`, jars pre-downloaded so first start works offline). |
| `docker-compose.yml` | Three services. **The api runs with `network_mode: service:emulators`.** That one line solves the upload-URL problem: the api reaches the emulators on `127.0.0.1` (its built-in default, so no env needed) and mints upload URLs on `LEARNWREN_HOST:9199`, which resolves both from the browser and from inside the shared namespace because the port is published on the host. nginx proxies `/api` to `emulators:3333`. |
| `docker/firebase.json` | Emulator config binding every emulator to `0.0.0.0` (a published port needs a non-loopback bind inside the container). Uses the deploy-safe `firestore.rules`, not the dev `_smoke` variant. |
| `docker/nginx.conf.template` | Mirrors `firebase.deploy.json`: SPA fallback, immutable hashed assets, no-store `index.html`, the same security headers and CSP with the Storage emulator origin in place of `storage.googleapis.com`. Rendered by the nginx image's envsubst with `NGINX_ENVSUBST_FILTER=^LEARNWREN_` so nginx's own `$uri`/`$host` survive. No HSTS: the stack is plain HTTP. |
| `docker/emulators-entrypoint.sh` | Passes `--import /data` only once an export exists there (`--import` on an empty directory fails) and always `--export-on-exit /data`. |
| `docker/smoke.sh` | The slice's runnable check: `up --build`, wait for `/api/health` through nginx, fetch the SPA shell and a deep route. |
| `.env.example` | The documented settings, every one defaulted for a single machine. Distinct from `.env.tpl`, which is the developer's 1Password template. |
| `docs/self-hosting.md` | The deployment guide: prerequisites, quick start, first run (verification link from emulator logs, admin bootstrap via the existing promote tool), configuration, backup/upgrade, limits, troubleshooting. |

**Security defaults.** The Emulator UI, Firestore and Auth ports are
unauthenticated, so they bind to `127.0.0.1` on the host by default
(`LEARNWREN_ADMIN_BIND`). The Storage port has its own bind
(`LEARNWREN_STORAGE_BIND`, also loopback by default) because remote browsers
need it for uploads; the guide states plainly that publishing it exposes
every uploaded file.

**Data.** One named volume, `emulator-data`, holding the emulator export.
`stop_grace_period: 60s` so `docker compose stop` lets the export finish.

## 4. Honest scope and the amended AC

The "no proprietary services" AC is **partially met**. The stack runs with no
cloud account and no credentials, and every feature in the user guide works
except one: real video. The fake transcoder never produces HLS output, a
video stays `TRANSCODING` until the dev completion endpoint is hit, and fake
playback storage serves a stub manifest. The Emulator Suite is also a
development tool, not a production data store. The epic's AC is amended in
place to record both facts; the drift report's EP-09 scope note already
routes EP-09 drift to the epic file.

Slice B, when taken, is Option B: an ffmpeg transcoder adapter behind the
`VideoTranscoder` port producing the same AES-128 HLS layout (`hls-naming.ts`
is the shared seam), an S3-compatible object store behind the storage ports,
and a decision on auth/data store, with `TECHNICAL_ARCHITECTURE.md` updated
first.

## 5. Verification

- `docker compose config -q` passes.
- `docker compose build` builds all three images from a clean context.
- `docker/smoke.sh` passes: health through nginx, SPA shell, deep-route
  fallback.
- Registration through nginx returns 201; the login page renders in headless
  Chromium under the nginx CSP with no console errors beyond the expected
  logged-out 401.
- Persistence: a registered account survives `docker compose stop` /
  `start`. Found and fixed on the way: `--export-on-exit` on the volume mount
  point itself fails with `EBUSY` (the exporter recreates its target
  directory), so exports go to `/data/export`.
- Manual: register, find the verification link in `docker compose logs
  emulators`, sign in, `pnpm tools:promote-to-admin`, open `/admin/health`.
- No CI job: building three images per run is minutes of CI for a packaging
  layer with no application code. Deferred; revisit if the Dockerfile starts
  changing often.
