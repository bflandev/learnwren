# Production Deploy + Custom Domain (learnwren.com) Design Spec

> [!NOTE]
> DOCUMENT STATUS: DRAFT

**Status:** Draft (2026-06-10)
**Scope:** Execute the first real production deploy of Learn Wren to the `learn-wren` Firebase project and serve it at `https://learnwren.com` (registered and DNS-hosted in Amazon Route 53). This spec consumes the deploy *mechanism* shipped by `2026-06-09` deploy wiring (`pnpm deploy`, `firebase.deploy.json`, dual-mode `main.ts`, smoke harness) and covers everything that runbook's "Not done yet" section deferred: production environment configuration, GCP resource provisioning (buckets, Transcoder, Pub/Sub), bucket CORS, the custom domain, and production email via Amazon SES.

## Goal

Done means:

- `https://learnwren.com` serves the SPA; `https://www.learnwren.com` 301-redirects to the apex; both carry valid TLS.
- The NestJS API serves production traffic as the gen2 Cloud Function `api` behind the Hosting `/api/**` rewrite — same-origin from the browser's perspective.
- End-to-end features work against real infrastructure: register/login (session cookies), course authoring + publish, video upload → GCP Transcoder → AES-128 HLS playback, lesson-material upload/download, cover-image and profile-picture upload, admin surfaces.
- Transactional email (verification, password reset, password changed, new-module notification) delivers from `noreply@learnwren.com` via Amazon SES SMTP.
- Deploys remain manual: `pnpm deploy` / `pnpm deploy:preview` from a developer machine.

## Non-Goals (deferred, with reasons)

- **CI auto-deploy.** Manual deploys while production stabilizes; wiring `FIREBASE_TOKEN`/SA-JSON into GitHub Actions is its own slice.
- **Canonical-URL handling for default domains.** `learn-wren.web.app` / `learn-wren.firebaseapp.com` keep serving forever (Hosting cannot disable or host-redirect them). Mitigation is app-level (`<link rel="canonical">` or client-side host redirect) — cosmetic/SEO, not launch-blocking.
- **Dedicated least-privilege runtime service account.** The function runs as the Compute Engine default SA (`62659829157-compute@developer.gserviceaccount.com`). Moving to a dedicated SA (set `serviceAccount` in `main.ts` options) needs an inventory of implicit roles (Firestore, Auth, Transcoder, Secret Manager) — follow-up slice.
- **Source-bucket lifecycle rule.** Raw uploads are re-probed/re-transcoded from source; choose an expiry deliberately later, not as a side effect here.
- **DMARC beyond `p=none`.** Start in monitor mode; tighten after reviewing reports.
- **`minInstances` / concurrency tuning.** Start at `memory: '512MiB'` + v2 defaults (concurrency 80, min 0); tune under real load.
- **Port-465 SMTP support beyond the code fix.** The transport fix lands (one line); production pins port 587.

## Decisions Made During Brainstorming

| Decision | Choice | Rationale |
| :--- | :--- | :--- |
| Domain shape | Apex primary (`learnwren.com`), `www` → apex redirect via the Hosting wizard | One canonical origin; site + API share it via the `/api/**` rewrite. |
| Provisioning tooling | Install gcloud CLI (`brew install --cask gcloud-cli`) + checked-in idempotent scripts in `tools/deploy/` | GCS bucket CORS has **no console UI** — pure-console is infeasible. Node-script alternative needs an SA key file on disk (discouraged) and extra IAM plumbing. Repo runbooks already print gcloud commands. |
| Email provider | Amazon SES, region `us-east-1`, SMTP on port 587 (STARTTLS) | Domain is already in Route 53: Easy-DKIM CNAMEs publish one-click into the same zone. Cheap; works with the existing nodemailer transport once the `secure`/`requireTLS` fix lands. |
| Email launch gate | Public launch waits for SES production access (sandbox delivers only to verified recipients) | Request submitted in Phase A since it is the long pole (typically <24 h). The site can be live on the domain before approval; real-user signup flows cannot. |
| Deploy env delivery | `.env.learn-wren` dotenv file copied into `dist/apps/api` by `patch-functions-package.mjs` *after* the build | The only sanctioned gen2 mechanism. `functions:config:set` is dead for v2 (legacy, blocked, EOL March 2027); console-set Cloud Run env vars are **wiped on every deploy** (firebase-tools PATCHes the whole env map). Webpack `output.clean: true` deletes anything placed in `dist/apps/api` before the predeploy build, hence copy-after-build (chosen over the lightly-documented `configDir` option for determinism). |
| Secret delivery | `SMTP_PASS` via `firebase functions:secrets:set` + `secrets: ['SMTP_PASS']` on the `onRequest` options | String-form secret binding is first-class in firebase-functions 6.6.0; the value surfaces as `process.env.SMTP_PASS` so the transport code is unchanged. Secret rotation requires a redeploy (values pin at deploy). |
| `FIREBASE_WEB_API_KEY` | Hard rename to `LEARNWREN_FIREBASE_WEB_API_KEY`, no fallback | `FIREBASE_` is a reserved env prefix: rejected as a dotenv key (aborts the deploy) **and** as a Secret Manager name — verified empirically against the pinned firebase-tools 15.16.0 `validateKey`. Nothing is deployed yet, so no compatibility shim. |
| `NODE_ENV` | Set `NODE_ENV=production` explicitly in `.env.learn-wren` | Gen2 Node images appear to set it, but it is not documented for nodejs22, and every prod guard in this repo fails toward fake adapters on a non-production value. Explicit beats assumed. |
| Pub/Sub push endpoint | Direct to the function's `run.app` URL (from `gcloud functions describe api --format='value(serviceConfig.uri)'`), **not** the Hosting domain, and **not** a hand-built `cloudfunctions.net` URL | Hosting rewrites add a 60 s timeout, CDN behavior, undocumented Authorization forwarding, and `pinTag` revision pinning; Firebase-deployed v2 functions sometimes never get a `cloudfunctions.net` endpoint. Audience must match byte-for-byte (see §5). |
| Webhook security boundary | `PubSubPushGuard` OIDC validation (signature, `iss`, `aud`, SA `email`, `email_verified`) — IAM `run.invoker` grant is forward-compatibility only | The Hosting rewrite requires the function to be publicly invokable, so IAM does not gate the endpoint today. State this honestly; do not present IAM as the boundary. |
| Function sizing | `memory: '512MiB'` in `main.ts` options | v2 default 256 MiB @ concurrency 80 is undersized for a NestJS monolith bundling firebase-admin, sharp, nodemailer, ffprobe. CPU stays 1 ≤ 2 GiB so cost scales with memory+time only. |
| CORS origins | `https://learnwren.com`, `https://www.learnwren.com`, `https://learn-wren.web.app`, `https://learn-wren.firebaseapp.com` in both `LEARNWREN_CORS_ORIGINS` and all bucket CORS policies, from day one | Default domains keep serving forever; including the custom domain before it connects is harmless and avoids a re-apply/redeploy cycle after DNS cutover. |
| Bucket names | `learn-wren-video-source`, `learn-wren-video-output`, `learn-wren-materials`, `learn-wren-cover`, `learn-wren-picture` — all `us-central1` | Globally-unique names derived from the project ID; co-located with the function region and Transcoder location. |
| Bucket posture | source/output/materials: uniform access + public-access-prevention. cover/picture: uniform access, **no** PAP, `allUsers` `roles/storage.objectViewer` | cover/picture serve via `https://storage.googleapis.com/<bucket>/<path>` public URLs (required by `LEARNWREN_*_PUBLIC_BASE_URL`); the other three serve only via signed URLs / service agents. |
| App buckets vs Firebase Storage | All five stay plain GCS buckets (not imported into Firebase) | All access is server-side Admin SDK + signed/public URLs; Firebase rules/client SDK add nothing. The *default* bucket must still be provisioned once because `firebase.deploy.json` deploys `storage.rules` to it. |

## Research Findings That Bind This Design

Verified 2026-06-10 against current official docs and, where marked *(empirical)*, against the repo's pinned `firebase-tools` 15.16.0 / `firebase-functions` 6.6.0:

1. **Reserved env prefix** *(empirical)*: dotenv keys with prefix `FIREBASE_`, `X_GOOGLE_`, `EXT_` (plus 19 literal names) are rejected; an invalid key in a loaded `.env` **aborts the deploy**. `FIREBASE_WEB_API_KEY` is also rejected as a secret name. → §1.1 rename.
2. **Push-guard call-shape bug** *(empirical)*: `pubsub-push.guard.ts` calls `verifyIdToken(token)`; `OAuth2Client` 10.x requires `{ idToken }` and throws on a bare string — every real push would 401 → dead-letter. The spec mock masked it. → §1.2 fix.
3. **SMTP transport never sets `secure`** : nodemailer does not infer TLS from port 465; SMTP on 465 hangs. Only 587 works today. → §1.3 fix.
4. **Materials bucket needs CORS** — contradicts `docs/security.md`'s "only video-output" audit: material *uploads* are browser XHR PUTs to v4 signed URLs (always preflighted; GCS answers preflights from bucket CORS). The 2026-05-31 audit analyzed only downloads (top-level navigation, CORS-exempt). → §1.6, §3.
5. **Gen2 IAM**: push invoker is `roles/run.invoker` on the underlying Cloud Run service (`gcloud functions add-invoker-policy-binding` is generation-aware); the existing runbook's `roles/cloudfunctions.invoker` does not gate gen2. The Pub/Sub service agent (`service-62659829157@gcp-sa-pubsub.iam.gserviceaccount.com`) needs `roles/iam.serviceAccountTokenCreator` to mint OIDC tokens. → §5.
6. **v4 URL signing from the function**: production Admin SDK init is ADC-only (no key file), so `getSignedUrl` signs via the IAM Credentials API — requires `iamcredentials.googleapis.com` enabled **and** the runtime SA granted `roles/iam.serviceAccountTokenCreator` *on itself*. Without both, playback/materials signing 500s. → §3.
7. **Transcoder service agent** (`service-62659829157@gcp-sa-transcoder.iam.gserviceaccount.com`) exists only after first job creation (or `gcloud beta services identity create --service=transcoder.googleapis.com`), with up to ~7 min delay; bucket grants fail before that. Use `roles/storage.objectAdmin` on the output bucket (objectCreator cannot overwrite, breaking retried jobs). → §3, §5.
8. **Custom domain (Quick Setup)**: apex ownership TXT (permanent — authorizes cert renewal) + a single console-provided A record per host (current docs show `199.36.158.100`; copy the console's values). `www` needs its own A record; the redirect is a wizard checkbox. Pre-existing **AAAA records (or A/CNAME to other providers) block SSL provisioning entirely**. CAA, if present, must allow both `letsencrypt.org` and `pki.goog`. Certs mint within hours (up to 24 h); an invalid-cert interstitial during provisioning is normal. Route 53: plain non-alias A records at the apex are fine; only one TXT record *set* per name (merge values). → §6.
9. **SES**: Easy DKIM = 3 CNAMEs, one-click publishable to Route 53 (same account); sandbox limits to verified recipients / 200 msgs/day until production access (short form; first response typically <24 h; quota accounting is per *recipient* — one course-notify fan-out can exhaust the sandbox cap). SMTP password is **derived** from the IAM secret key, per-region — not the secret key itself. GCP blocks only port 25 egress; 587/465 are open. → §7.
10. **ffprobe/sharp in the cloud build**: `dist/apps/api/package.json` (NxAppWebpackPlugin `generatePackageJson`) externalizes `@ffprobe-installer/ffprobe` and `sharp`; the GCF buildpack installs linux-x64 binaries via optionalDependencies. No code change needed; verified by Phase C playback/probe checks.

## 1. Repo Changes (one branch; lands before any cloud work)

### 1.1 Rename `FIREBASE_WEB_API_KEY` → `LEARNWREN_FIREBASE_WEB_API_KEY`

- `libs/api-firebase/src/lib/firebase-admin.module.ts` (read at ~:107 + the error message), `firebase-admin.module.spec.ts` (all references).
- `.env.tpl` (the `op://learnwren/Web SDK Config/apiKey` line) — rendered env key changes; vault item/field unchanged.
- `docs/deployment.md`, `docs/secrets.md` vault-contract row.

### 1.2 Fix `PubSubPushGuard` token verification

- `libs/api-courses/src/lib/video/webhook/pubsub-push.guard.ts`: `this.verifier.verifyIdToken({ idToken: token })`.
- Tighten the structural `IdTokenVerifier` interface to `{ idToken: string }` so the spec mock must match the real call shape (prevents bivariance masking recurring).
- TDD: spec asserting the real argument shape fails before, passes after.

### 1.3 Fix `SmtpEmailTransport` TLS mode

- `libs/api-auth/src/lib/email-transport/smtp-email-transport.ts`: `secure: port === 465`, `requireTLS: true` when not secure. Mirror in spec.

### 1.4 `apps/api/src/main.ts` onRequest options

- Add `secrets: ['SMTP_PASS']` and `memory: '512MiB'` to the existing options object (region/maxInstances already there). Update the in-code comment that claims v2 memory defaults apply.

### 1.5 Deploy env delivery

- New committed template `.env.deploy.tpl` (op:// references to a new `prod` vault item) + script `secrets:render:deploy` → renders gitignored `.env.learn-wren` at repo root.
- `tools/deploy/patch-functions-package.mjs`: after the existing patches, copy `.env.learn-wren` (and only that file — never the local-dev `.env`) from repo root into `dist/apps/api/`. Behavior is flag-controlled so the smoke harness keeps working: with `--require-deploy-env` (added to the `firebase.deploy.json` predeploy invocation) a missing file **fails the deploy** — a function deployed without env crashes on the production guards; without the flag (smoke docs / local runs) a missing file just prints a prominent warning. A stray `.env.learn-wren` in `dist` is harmless to smoke: the CLI only loads `.env.<projectId>` matching the active project (`demo-learnwren-smoke`).
- `.gitignore`: add `.env.learn-wren`. Never create both `.env.learn-wren` and `.env.<alias>` in the functions dir (hard deploy error).

### 1.6 Bucket CORS policies

- `tools/deploy/gcs-cors.json` (video output): add `https://learnwren.com` + `https://www.learnwren.com` to origins.
- New `tools/deploy/gcs-cors-materials.json`: same four origins; methods `PUT`, `OPTIONS`; responseHeader `Content-Type`; maxAge 3600.
- New `tools/deploy/gcs-cors-source.json`: same origins; methods `PUT`, `OPTIONS`; responseHeader `Content-Range`, `Content-Type` — covers the resumable-session/origin doc ambiguity cheaply.
- Extend `tools/deploy/verify-gcs-cors.mjs` to also assert a materials-bucket `PUT` preflight.

### 1.7 Provisioning scripts (idempotent, parameterized `PROJECT_ID`/`REGION`)

- `tools/deploy/provision-buckets.sh`: enable APIs; create the five buckets per the posture table; apply the three CORS files; grant runtime SA `roles/storage.objectAdmin` on all five + `roles/iam.serviceAccountTokenCreator` on itself; pre-provision the Transcoder service identity and grant it `objectViewer` (source) / `objectAdmin` (output).
- `tools/deploy/provision-pubsub.sh`: topic + dead-letter topic/sub; invoker SA; Pub/Sub service-agent `tokenCreator` grant; `run.invoker` via `gcloud functions add-invoker-policy-binding`; push subscription with OIDC (`--push-auth-service-account`, `--push-auth-token-audience` byte-identical to `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE`); echoes the values that must land in `.env.learn-wren`.

### 1.8 Docs reconciliation

- `docs/deployment.md`: replace the env-mechanism claims (`functions:config:set` / console env vars) with the dotenv + secrets flow; expand "Custom domain" into the §6 runbook; add bucket-provisioning prerequisites + the `LEARNWREN_PUBLIC_URL`-drives-resumable-CORS note; update the "Not done yet" list.
- `docs/operations/transcoder-pubsub-setup.md`: gen2 rewrite (run.invoker, `serviceConfig.uri` URL derivation, Pub/Sub SA tokenCreator, service-agent timing, `PROJECT_ID=learn-wren`).
- `docs/security.md`: amend the CORS-posture section (materials upload preflight; source-bucket policy).
- `docs/secrets.md`: new `prod` vault item contract rows + renamed key.

## 2. Production Environment (complete inventory for `.env.learn-wren`)

| Var | Value |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `LEARNWREN_FIREBASE_TARGET` | `production` |
| `LEARNWREN_API_FIREBASE_PROJECT_ID` | `learn-wren` |
| `LEARNWREN_FIREBASE_WEB_API_KEY` | from vault (`Web SDK Config/apiKey`) |
| `LEARNWREN_CORS_ORIGINS` | `https://learnwren.com,https://www.learnwren.com,https://learn-wren.web.app,https://learn-wren.firebaseapp.com` |
| `LEARNWREN_PUBLIC_URL` | `https://learnwren.com` (drives email links **and** resumable-upload session origin) |
| `LEARNWREN_EMAIL_TRANSPORT` | `smtp` (set `console` until SES production access is granted, if deploying earlier) |
| `LEARNWREN_EMAIL_FROM` | `noreply@learnwren.com` |
| `SMTP_HOST` | `email-smtp.us-east-1.amazonaws.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | SES SMTP access key id (vault) |
| `SMTP_PASS` | **not in .env** — Secret Manager via `firebase functions:secrets:set SMTP_PASS` |
| `LEARNWREN_VIDEO_SOURCE_BUCKET` | `learn-wren-video-source` |
| `LEARNWREN_VIDEO_OUTPUT_BUCKET` | `learn-wren-video-output` |
| `LEARNWREN_GCP_PROJECT_ID` | `learn-wren` |
| `LEARNWREN_TRANSCODER_LOCATION` | `us-central1` |
| `LEARNWREN_TRANSCODER_TOPIC` | `learn-wren-transcoder-events-prod` |
| `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE` | `<serviceConfig.uri>/api/internal/transcoder-events` (Phase C; provisional value at first deploy) |
| `LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL` | `learn-wren-transcoder-invoker@learn-wren.iam.gserviceaccount.com` |
| `LEARNWREN_MATERIALS_BUCKET` | `learn-wren-materials` |
| `LEARNWREN_COVER_BUCKET` | `learn-wren-cover` |
| `LEARNWREN_COVER_PUBLIC_BASE_URL` | `https://storage.googleapis.com/learn-wren-cover` |
| `LEARNWREN_PICTURE_BUCKET` | `learn-wren-picture` |
| `LEARNWREN_PICTURE_PUBLIC_BASE_URL` | `https://storage.googleapis.com/learn-wren-picture` |

Optional tuning vars keep their defaults.

## 3. Phase A — Provisioning With No Deployed Function

1. `brew install --cask gcloud-cli` → `gcloud auth login` → `gcloud config set project learn-wren`.
2. Run `tools/deploy/provision-buckets.sh` (enables `transcoder.googleapis.com`, `pubsub.googleapis.com`, `iamcredentials.googleapis.com`; creates buckets; applies CORS; IAM grants incl. the runtime-SA self-grant of `tokenCreator`).
3. Console one-timers: provision the default Firebase Storage bucket (required or the `storage.rules` deploy target errors); confirm Firestore (Native, region noted) and Auth (Email/Password) are enabled — expected done per the 2026-04-30 connection spec, verify only.
4. **SES (parallel track, us-east-1)**: create the `learnwren.com` domain identity (Easy DKIM 2048) → one-click publish the 3 DKIM CNAMEs to Route 53; **submit the production-access request now** (mail type Transactional, site URL `https://learnwren.com`); create SMTP credentials (IAM); add `_dmarc.learnwren.com` TXT `v=DMARC1; p=none; rua=mailto:bflan1972@gmail.com`; `firebase functions:secrets:set SMTP_PASS`.
5. Populate the new `prod` 1Password vault item; `pnpm secrets:render:deploy`.

## 4. Phase B — First Deploy

1. `pnpm deploy` (predeploy builds api + web, patches the package, copies `.env.learn-wren`).
2. Smoke against `https://learn-wren.web.app`: `/api/health` 200; register → login → session cookie; course create + publish; cover upload; material upload (exercises the new CORS); admin login.
3. `node tools/deploy/verify-gcs-cors.mjs` with a real signed URL from the deployed API.

## 5. Phase C — Pub/Sub Wiring + Video Verification

1. `FUNCTION_ORIGIN=$(gcloud functions describe api --region=us-central1 --format='value(serviceConfig.uri)')`.
2. Run `tools/deploy/provision-pubsub.sh` with `PUSH_ENDPOINT=${FUNCTION_ORIGIN}/api/internal/transcoder-events` — the same string goes into the subscription's `--push-auth-token-audience` and `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE` (the guard compares byte-for-byte, scheme/host/path/trailing-slash included).
3. Update `.env.learn-wren` (via the vault + re-render) and `pnpm deploy:preview` (functions-only redeploy).
4. Verify: real video upload → transcode completes (watch the dead-letter sub stays empty) → playback on `learn-wren.web.app`.

## 6. Phase D — Custom Domain (Firebase Wizard + Route 53)

1. **Pre-flight the zone** (`dig`/console): no AAAA at apex or `www`; no A/CNAME pointing elsewhere; if CAA exists anywhere up the chain it must allow `letsencrypt.org` **and** `pki.goog`; note the existing apex TXT record set (Firebase's value merges into it — one TXT set per name in Route 53).
2. Firebase console → Hosting → Add custom domain → `learnwren.com` (Quick Setup): add the ownership TXT (permanent) + the console-provided A record(s) at the apex; TTL 300 during setup.
3. Add custom domain → `www.learnwren.com` with "redirect to learnwren.com": add its A record.
4. Wait for cert (hours, ≤24 h; invalid-cert interstitial during provisioning is normal — no action).
5. Verify: `https://learnwren.com` full walkthrough **including video playback** (page origin changes; bucket CORS already allows it), `www` → apex 301, `dig` A/TXT records.

## 7. Phase E — Email Live

1. On SES production-access approval: if the first deploy went out with `LEARNWREN_EMAIL_TRANSPORT=console`, flip to `smtp` and `pnpm deploy:preview`.
2. Verify: register with a real mailbox → verification email received (DKIM=pass in headers); password-reset round trip; password-changed notice.

## 8. Verification Checklist (gates between phases)

- Repo branch: affected lint/test/build/e2e green; new specs fail-before/pass-after; `pnpm smoke` still green locally without `.env.learn-wren`.
- Phase B: smoke list above + CORS verifier.
- Phase C: one full video lifecycle; dead-letter empty; signed URLs work (proves `tokenCreator` self-grant + `iamcredentials` API).
- Phase D: domain walkthrough + DNS digs.
- Phase E: real inbox receipts, DKIM pass.

## 9. Rollback

- **Hosting**: one-click release rollback (console → Hosting → release history).
- **Functions**: redeploy the previous build (`pnpm deploy:preview` from the prior commit).
- **DNS**: delete the A records — the site keeps serving on `learn-wren.web.app`; the ownership TXT may stay.
- **Email**: flip `LEARNWREN_EMAIL_TRANSPORT=console` + functions redeploy.
- Firestore data is never touched by deploys (schema-less, no migrations).

## Open Questions

None — all decisions above are resolved. The only external dependency with nondeterministic timing is SES production-access approval (typically <24 h).
