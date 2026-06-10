# Production Deploy + learnwren.com Custom Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the first real production deploy of Learn Wren to the `learn-wren` Firebase project and serve it at `https://learnwren.com` (Route 53 DNS), fully functional including video, storage, and SES email.

**Architecture:** Tasks 1–10 are repo changes on a feature branch (three production-blocking bug fixes, gen2 env delivery, CORS policies, provisioning scripts, docs) merged to main before any cloud work. Tasks 11–15 are the operational phases A–E from the spec: GCP/AWS provisioning → first deploy → Pub/Sub wiring → custom domain → email live. Spec: `docs/superpowers/specs/2026-06-10-production-deploy-and-custom-domain-design.md`.

**Tech Stack:** Nx 22 / pnpm monorepo, NestJS 11 (gen2 Cloud Function via firebase-tools 15.16.0 + firebase-functions 6.6.0), Angular 21 on Firebase Hosting, GCS + Transcoder API + Pub/Sub, Amazon SES, Route 53, 1Password CLI (`op`), gcloud CLI.

**Execution notes:**
- Tasks 1–10 run in a git worktree branched from local HEAD (`git worktree add ../learnwren-deploy-prod -b feat/deploy-prod HEAD`), node_modules symlinked from the parent; merge `--no-ff` from the main checkout. Never `git add -A` (the symlink evades `.gitignore`).
- Tasks 11–15 are interactive operational runbooks (gcloud auth, Firebase/AWS consoles, multi-hour waits for SSL/SES). Execute them inline with the user present — do NOT dispatch them to subagents. They run from the main checkout after the merge.
- Test commands assume the worktree root as cwd. Per-feature unit suites run with `pnpm exec nx test <project> --skip-nx-cache`.

---

## Task 1: Rename env var `FIREBASE_WEB_API_KEY` → `LEARNWREN_FIREBASE_WEB_API_KEY`

`FIREBASE_` is a reserved env-var prefix in Cloud Functions deploys; a reserved key in a loaded `.env` **aborts the whole deploy**, and the name is also rejected as a Secret Manager secret name. Only the `process.env` key changes — the DI token `FIREBASE_WEB_API_KEY` (a Symbol in `libs/api-firebase/src/lib/firebase.tokens.ts`) and its consumers (`FirebaseAuthRestClient`) are untouched.

**Files:**
- Modify: `libs/api-firebase/src/lib/firebase-admin.module.spec.ts:14-19,90-96,137-149,160-170,172-176,194-198`
- Modify: `libs/api-firebase/src/lib/firebase-admin.module.ts:104-116`
- Modify: `.env.tpl` (the `FIREBASE_WEB_API_KEY=` line, ~line 23)
- Modify: `docs/secrets.md:38` (vault-contract row)

- [ ] **Step 1: Update the spec to expect the new env name (red)**

In `libs/api-firebase/src/lib/firebase-admin.module.spec.ts`, make these exact replacements (env-var strings only — `moduleRef.get(FIREBASE_WEB_API_KEY)` token usages stay):

```ts
// TARGET_KEYS (line 14-19): rename the env cleanup entry
const TARGET_KEYS = [
  'LEARNWREN_FIREBASE_TARGET',
  'LEARNWREN_API_FIREBASE_PROJECT_ID',
  'FIREBASE_SERVICE_ACCOUNT_JSON_PATH',
  'LEARNWREN_FIREBASE_WEB_API_KEY',
] as const;
```

```ts
// line 90-96
    it('resolves FIREBASE_WEB_API_KEY to the env var value when it is set', async () => {
      process.env['LEARNWREN_FIREBASE_WEB_API_KEY'] = 'caller-provided-key';
```

```ts
// line 137-149
    it('throws when LEARNWREN_FIREBASE_WEB_API_KEY is unset in production mode', async () => {
      process.env['LEARNWREN_FIREBASE_TARGET'] = 'production';
      process.env['LEARNWREN_API_FIREBASE_PROJECT_ID'] = 'test-prod-id';
      // Intentionally omit LEARNWREN_FIREBASE_WEB_API_KEY.

      // The throw happens inside the useFactory, so it surfaces when the
      // testing module resolves the provider.
      await expect(
        Test.createTestingModule({
          imports: [FirebaseAdminModule.forRoot()],
        }).compile(),
      ).rejects.toThrow(/LEARNWREN_FIREBASE_WEB_API_KEY/);
    });
```

```ts
// line 163 (verbatim-resolution test)
      process.env['LEARNWREN_FIREBASE_WEB_API_KEY'] = 'prod-web-api-key-123';
```

```ts
// line 175 (real-project-ID test) and line 197 (cert-credential test)
      process.env['LEARNWREN_FIREBASE_WEB_API_KEY'] = 'test-web-api-key';
```

- [ ] **Step 2: Run the suite to verify the red state**

Run: `pnpm exec nx test api-firebase --skip-nx-cache`
Expected: FAIL — at least these 5 tests fail (module still reads the old env name): "resolves FIREBASE_WEB_API_KEY to the env var value when it is set" (gets `'fake-api-key'`), "throws when LEARNWREN_FIREBASE_WEB_API_KEY is unset in production mode" (error message regex mismatch), "resolves FIREBASE_WEB_API_KEY to the env value verbatim in production", "initializes against the real project ID…", "initializes with cert credential…" (the latter three reject at compile because the factory sees no key).

- [ ] **Step 3: Update the module (green)**

In `libs/api-firebase/src/lib/firebase-admin.module.ts`, replace the provider factory body (lines 104–116):

```ts
        {
          provide: FIREBASE_WEB_API_KEY,
          useFactory: () => {
            // NOTE: env key is LEARNWREN_-prefixed because FIREBASE_ is a
            // reserved prefix in Cloud Functions deploys — a FIREBASE_* key in
            // the deploy .env aborts `firebase deploy` entirely.
            const key = process.env['LEARNWREN_FIREBASE_WEB_API_KEY'];
            if (mode === 'production' && !key) {
              throw new Error(
                '[FirebaseAdminModule] LEARNWREN_FIREBASE_TARGET=production requires LEARNWREN_FIREBASE_WEB_API_KEY to be set.',
              );
            }
            // In emulator mode, the Auth emulator accepts any key string.
            return key ?? 'fake-api-key';
          },
        },
```

- [ ] **Step 4: Run the suite to verify green**

Run: `pnpm exec nx test api-firebase --skip-nx-cache`
Expected: PASS (all tests).

- [ ] **Step 5: Update `.env.tpl` and `docs/secrets.md`**

In `.env.tpl`, replace the line `FIREBASE_WEB_API_KEY=op://learnwren/Web SDK Config/apiKey` with:

```
LEARNWREN_FIREBASE_WEB_API_KEY=op://learnwren/Web SDK Config/apiKey
```

In `docs/secrets.md` line 38, change the third column of the `Web SDK Config` row from `` `FIREBASE_WEB_API_KEY` `` to `` `LEARNWREN_FIREBASE_WEB_API_KEY` `` (rest of the row unchanged).

- [ ] **Step 6: Guard against stragglers**

Run: `grep -rn "process.env\['FIREBASE_WEB_API_KEY'\]\|FIREBASE_WEB_API_KEY=" libs apps tools .env.tpl --include="*.ts" --include="*.tpl" | grep -v LEARNWREN_`
Expected: no output. (`docs/deployment.md:82` is intentionally deferred to Task 9, which rewrites that file's env section wholesale; historical plans/mutation reports under `docs/` stay as-is.)

- [ ] **Step 7: Commit**

```bash
git add libs/api-firebase/src/lib/firebase-admin.module.ts libs/api-firebase/src/lib/firebase-admin.module.spec.ts .env.tpl docs/secrets.md
git commit -m "fix(api-firebase): rename FIREBASE_WEB_API_KEY env to LEARNWREN_ prefix

FIREBASE_ is a reserved env prefix for Cloud Functions deploys: a reserved
key in the deploy .env aborts firebase deploy, and the name is rejected as
a secret name too. DI token symbol unchanged."
```

---

## Task 2: Fix `PubSubPushGuard` — `verifyIdToken` requires an options object

`google-auth-library`'s `OAuth2Client.verifyIdToken` takes `{ idToken }`; the guard passes a bare string, so in production every Pub/Sub push would throw inside the verifier → 401 → dead-letter. The spec's loosely-typed mock masked it. Tightening the structural interface makes the mock follow the real call shape.

**Files:**
- Modify: `libs/api-courses/src/lib/video/webhook/pubsub-push.guard.spec.ts:18-35,50-57`
- Modify: `libs/api-courses/src/lib/video/webhook/pubsub-push.guard.ts:10-23,55-65`

- [ ] **Step 1: Update the spec to assert the real call shape (red)**

In `pubsub-push.guard.spec.ts`, change `makeGuard`'s verifier signature (lines 18–35):

```ts
function makeGuard(opts: {
  audience: string;
  invokerSaEmail: string;
  verifier: (options: { idToken: string }) => Promise<{
    getPayload: () => {
      iss?: string;
      aud?: string;
      email?: string;
      email_verified?: boolean;
      exp?: number;
    };
  }>;
}) {
  return new PubSubPushGuard(
    { webhookAudience: opts.audience, invokerSaEmail: opts.invokerSaEmail } as never,
    { verifyIdToken: opts.verifier } as never,
  );
}
```

And in the happy-path test (lines 50–57), replace the call-shape assertion:

```ts
    // The "Bearer " prefix and surrounding whitespace must be stripped, and the
    // raw token must be passed as { idToken } — google-auth-library's
    // OAuth2Client.verifyIdToken REQUIRES an options object and throws on a
    // bare string (the production-breaking bug this locks down).
    expect(verifier).toHaveBeenCalledWith({ idToken: 'the-token' });
```

- [ ] **Step 2: Run to verify red**

Run: `pnpm exec nx test api-courses --skip-nx-cache` (vitest; to narrow, append the positional filter `-- pubsub-push`)
Expected: FAIL — "passes when issuer + audience + email match and not expired" fails on `toHaveBeenCalledWith({ idToken: 'the-token' })` (actual call was with `'the-token'`).

- [ ] **Step 3: Fix the guard (green)**

In `pubsub-push.guard.ts`, replace the interface (lines 10–23):

```ts
// Minimal structural type satisfied by google-auth-library's OAuth2Client.
// NOTE: verifyIdToken takes an OPTIONS OBJECT ({ idToken }) — OAuth2Client
// throws 'The verifyIdToken method requires an ID Token' on a bare string.
// The interface mirrors the real call shape so spec mocks cannot drift.
export interface IdTokenVerifier {
  verifyIdToken(options: { idToken: string }): Promise<{
    getPayload():
      | {
          iss?: string;
          aud?: string | string[];
          email?: string;
          email_verified?: boolean;
          exp?: number;
        }
      | undefined;
  }>;
}
```

And in `verifyToken` (line 58), change the call:

```ts
      const ticket = await this.verifier.verifyIdToken({ idToken: token });
```

- [ ] **Step 4: Run to verify green + typecheck the OAuth2Client wiring**

Run: `pnpm exec nx test api-courses --skip-nx-cache && pnpm exec nx run-many -t typecheck -p api-courses`
Expected: PASS. The typecheck proves `new OAuth2Client()` (wired at `libs/api-courses/src/lib/video/video.module.ts:90-91`) still satisfies the tightened structural interface — `OAuth2Client.verifyIdToken(options)` matches; no module change needed.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/video/webhook/pubsub-push.guard.ts libs/api-courses/src/lib/video/webhook/pubsub-push.guard.spec.ts
git commit -m "fix(api-courses): pass { idToken } to verifyIdToken in PubSubPushGuard

OAuth2Client.verifyIdToken requires an options object and throws on a bare
string — every real transcoder push would 401 and dead-letter. Interface
tightened to the real call shape so mocks can't mask it again."
```

---

## Task 3: Fix `SmtpEmailTransport` — explicit TLS mode

Make the TLS mode explicit instead of relying on nodemailer's undefined-`secure` port-465 inference; without `requireTLS`, STARTTLS on 587 is only opportunistic — that is the genuine behavioral fix. Production uses SES on 587. *(Execution note: verified during review that nodemailer 8.0.7 does infer implicit TLS on 465 when `secure` is undefined — the original "465 would hang" claim was wrong; comment wording corrected accordingly.)*

**Files:**
- Modify: `libs/api-auth/src/lib/email-transport/smtp-email-transport.spec.ts` (the `passes host/port/auth…` test, ~line 35)
- Modify: `libs/api-auth/src/lib/email-transport/smtp-email-transport.ts:29-35`

- [ ] **Step 1: Update + add transport-creation tests (red)**

In `smtp-email-transport.spec.ts`, replace the existing `it('passes host/port/auth into nodemailer createTransport', …)` test with these two:

```ts
  it('creates a STARTTLS transport (secure:false, requireTLS:true) for port 587', () => {
    new SmtpEmailTransport(baseConfig); // baseConfig.port === 587
    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: baseConfig.host,
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: baseConfig.user, pass: baseConfig.password },
    });
  });

  it('creates an implicit-TLS transport (secure:true) for port 465', () => {
    new SmtpEmailTransport({ ...baseConfig, port: 465 });
    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: baseConfig.host,
      port: 465,
      secure: true,
      auth: { user: baseConfig.user, pass: baseConfig.password },
    });
  });
```

- [ ] **Step 2: Run to verify red**

Run: `pnpm exec nx test api-auth --skip-nx-cache`
Expected: FAIL — both new tests fail (actual `createTransport` call has no `secure`/`requireTLS` keys).

- [ ] **Step 3: Fix the transport (green)**

In `smtp-email-transport.ts`, replace the constructor body (lines 29–35):

```ts
  constructor(private readonly config: SmtpEmailTransportConfig) {
    // Be explicit about TLS mode rather than relying on nodemailer's
    // undefined-`secure` port-465 inference. 587 uses STARTTLS — requireTLS
    // makes it mandatory rather than opportunistic (a STARTTLS-stripping
    // MITM would otherwise surface as a confusing auth failure).
    const secure = config.port === 465;
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure,
      ...(secure ? {} : { requireTLS: true }),
      auth: { user: config.user, pass: config.password },
    });
  }
```

- [ ] **Step 4: Run to verify green**

Run: `pnpm exec nx test api-auth --skip-nx-cache`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-auth/src/lib/email-transport/smtp-email-transport.ts libs/api-auth/src/lib/email-transport/smtp-email-transport.spec.ts
git commit -m "fix(api-auth): set explicit TLS mode on the SMTP transport

secure:true for implicit-TLS 465 (explicit, rather than relying on
nodemailer's undefined-secure port inference); requireTLS makes the 587
STARTTLS path mandatory instead of opportunistic."
```

---

## Task 3b: Cover/picture storage — production guards (mirror video/materials)

Unlike video/materials (which default to real adapters in production and **reject** fakes), cover and picture select their adapter with `raw === 'firebase' ? 'firebase' : 'fake'` and have **no** production guard — an unset `LEARNWREN_COVER_STORAGE`/`LEARNWREN_PICTURE_STORAGE` silently runs in-memory fake adapters in production while the public-base-URLs point at real buckets that never receive objects (broken images). Found by plan verification; mirrors the `video.config.ts` pattern.

**Files:**
- Modify: `libs/api-courses/src/lib/cover/cover.config.spec.ts`
- Modify: `libs/api-courses/src/lib/cover/cover.config.ts:34-36`
- Modify: `libs/api-profile/src/lib/picture/picture.config.spec.ts`
- Modify: `libs/api-profile/src/lib/picture/picture.config.ts:34-36`

- [ ] **Step 1: Add the production-guard tests for cover (red)**

Append inside the `describe('readCoverConfigFromEnv', …)` block in `cover.config.spec.ts`:

```ts
  it('defaults impl to "firebase" in production when LEARNWREN_COVER_STORAGE is unset', () => {
    // Without this, production would silently run the in-memory fake adapter
    // while the public base URL points at a real bucket that never gets objects.
    const cfg = readCoverConfigFromEnv({
      NODE_ENV: 'production',
      LEARNWREN_COVER_BUCKET: 'b',
      LEARNWREN_COVER_PUBLIC_BASE_URL: 'https://storage.googleapis.com/b',
    });
    expect(cfg.impl).toBe('firebase');
  });

  it('rejects an explicit LEARNWREN_COVER_STORAGE=fake in production', () => {
    expect(() =>
      readCoverConfigFromEnv({
        NODE_ENV: 'production',
        LEARNWREN_COVER_BUCKET: 'b',
        LEARNWREN_COVER_PUBLIC_BASE_URL: 'https://storage.googleapis.com/b',
        LEARNWREN_COVER_STORAGE: 'fake',
      }),
    ).toThrow(/LEARNWREN_COVER_STORAGE=fake is rejected when NODE_ENV=production/);
  });
```

- [ ] **Step 2: Run to verify red**

Run: `pnpm exec nx test api-courses --skip-nx-cache -- cover.config`
Expected: FAIL — the first new test gets `'fake'`, the second does not throw.

- [ ] **Step 3: Implement the cover guard (green)**

In `cover.config.ts`, replace lines 34–36 (`const raw = …; const impl = …; return …`) with:

```ts
  const raw = env['LEARNWREN_COVER_STORAGE'];
  // Mirror video.config.ts: production defaults to the real adapter and
  // rejects an explicit fake; dev/test default to the credential-free fake.
  const impl: CoverStorageImpl =
    raw === 'firebase' || raw === 'fake' ? raw : isProduction ? 'firebase' : 'fake';
  if (impl === 'fake' && isProduction) {
    throw new Error('LEARNWREN_COVER_STORAGE=fake is rejected when NODE_ENV=production.');
  }
  return { bucket, publicBaseUrl, impl };
```

- [ ] **Step 4: Run to verify green**

Run: `pnpm exec nx test api-courses --skip-nx-cache -- cover.config`
Expected: PASS — including the existing tests (`defaults impl to "fake" when unset (dev/test posture)` still passes: non-production default stays `'fake'`).

- [ ] **Step 5: Repeat for picture (red → green)**

`picture.config.spec.ts` — append inside `describe('readPictureConfigFromEnv', …)` the same two tests with `Picture`/`PICTURE` substituted:

```ts
  it('defaults impl to "firebase" in production when LEARNWREN_PICTURE_STORAGE is unset', () => {
    const cfg = readPictureConfigFromEnv({
      NODE_ENV: 'production',
      LEARNWREN_PICTURE_BUCKET: 'b',
      LEARNWREN_PICTURE_PUBLIC_BASE_URL: 'https://storage.googleapis.com/b',
    });
    expect(cfg.impl).toBe('firebase');
  });

  it('rejects an explicit LEARNWREN_PICTURE_STORAGE=fake in production', () => {
    expect(() =>
      readPictureConfigFromEnv({
        NODE_ENV: 'production',
        LEARNWREN_PICTURE_BUCKET: 'b',
        LEARNWREN_PICTURE_PUBLIC_BASE_URL: 'https://storage.googleapis.com/b',
        LEARNWREN_PICTURE_STORAGE: 'fake',
      }),
    ).toThrow(/LEARNWREN_PICTURE_STORAGE=fake is rejected when NODE_ENV=production/);
  });
```

Run `pnpm exec nx test api-profile --skip-nx-cache -- picture.config` (red), then apply the same implementation to `picture.config.ts` lines 34–36:

```ts
  const raw = env['LEARNWREN_PICTURE_STORAGE'];
  // Mirror video.config.ts: production defaults to the real adapter and
  // rejects an explicit fake; dev/test default to the credential-free fake.
  const impl: PictureStorageImpl =
    raw === 'firebase' || raw === 'fake' ? raw : isProduction ? 'firebase' : 'fake';
  if (impl === 'fake' && isProduction) {
    throw new Error('LEARNWREN_PICTURE_STORAGE=fake is rejected when NODE_ENV=production.');
  }
  return { bucket, publicBaseUrl, impl };
```

Run `pnpm exec nx test api-profile --skip-nx-cache -- picture.config` (green).

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/cover/cover.config.ts libs/api-courses/src/lib/cover/cover.config.spec.ts libs/api-profile/src/lib/picture/picture.config.ts libs/api-profile/src/lib/picture/picture.config.spec.ts
git commit -m "fix(api): cover/picture storage default to real adapter in production

The 'firebase'-or-fake selection had no production guard — an unset
LEARNWREN_COVER_STORAGE/LEARNWREN_PICTURE_STORAGE silently served in-memory
fakes in production. Mirrors the video/materials config pattern: production
defaults to real, explicit fake is rejected at boot."
```

---

## Task 4: `main.ts` onRequest options — memory + SMTP_PASS secret binding

**Files:**
- Modify: `apps/api/src/main.ts:110-126`

- [ ] **Step 1: Update the options object and its comment**

Replace lines 110–126 of `apps/api/src/main.ts` with:

```ts
  // Export the Cloud Function named 'api'. Firebase Hosting rewrites /api/**
  // to this function. Region + maxInstances provide a cost guard. memory is
  // raised from the 256 MiB v2 default — a NestJS monolith bundling
  // firebase-admin, sharp, nodemailer and ffprobe at the default concurrency
  // (80) is undersized at 256 MiB. SMTP_PASS binds from Cloud Secret Manager
  // (`firebase functions:secrets:set SMTP_PASS`) and surfaces as
  // process.env.SMTP_PASS at runtime; rotation requires a redeploy.
  //
  // Use module.exports (not exports) — webpack bundles the entry in an IIFE
  // where `exports` is the closure-local object, not the Node.js module.exports.
  // The functions emulator discovers exports via require(bundlePath).api.
  module.exports.api = onRequest(
    {
      region: 'us-central1',
      maxInstances: 10,
      memory: '512MiB',
      secrets: ['SMTP_PASS'],
    },
    async (req, res) => {
      await ensureNestInitialized();
      expressApp(req, res);
    },
  );
```

- [ ] **Step 2: Build to verify it compiles**

Run: `pnpm exec nx build api --configuration=production --skip-nx-cache && pnpm exec nx run-many -t typecheck -p api`
Expected: both succeed. (`firebase-functions` 6.6.0 types accept `memory: '512MiB'` and `secrets: string[]`.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/main.ts
git commit -m "feat(api): size the api function (512MiB) and bind SMTP_PASS secret"
```

---

## Task 5: Deploy env delivery — template, render script, patch-script copy

`firebase deploy` reads dotenv files from the functions source dir (`dist/apps/api`), but webpack (`output.clean: true`) wipes that dir during the predeploy build — so the rendered env file is copied in *after* the build by the patch script. `.secret.local` (emulator-only, ignored by real deploys) is always written so the functions emulator can resolve the `secrets: ['SMTP_PASS']` binding during `pnpm smoke` without Cloud access.

**Files:**
- Create: `.env.deploy.tpl`
- Modify: `tools/deploy/patch-functions-package.mjs`
- Modify: `package.json` (scripts block, after `secrets:render`)
- Modify: `.gitignore:35-36`
- Modify: `firebase.deploy.json:14-17` (functions predeploy)

- [ ] **Step 1: Create `.env.deploy.tpl`**

```
# .env.deploy.tpl — 1Password template for the PRODUCTION functions runtime env.
# Render with: pnpm secrets:render:deploy
#   (op inject -i .env.deploy.tpl -o .env.learn-wren)
# The rendered .env.learn-wren is GITIGNORED. tools/deploy/patch-functions-package.mjs
# copies it into dist/apps/api at deploy time, where `firebase deploy` reads it —
# dotenv files in the functions source dir are the ONLY supported gen2 env
# mechanism (functions:config:set is legacy/dead; console-set Cloud Run env vars
# are wiped on every deploy).
#
# SMTP_PASS is deliberately ABSENT: it lives in Cloud Secret Manager
# (`firebase functions:secrets:set SMTP_PASS`) and binds via the `secrets:`
# option in apps/api/src/main.ts.
# NEVER add a key starting with FIREBASE_, X_GOOGLE_ or EXT_ — reserved
# prefixes abort the deploy.

NODE_ENV=production
LEARNWREN_FIREBASE_TARGET=production
LEARNWREN_API_FIREBASE_PROJECT_ID=learn-wren
LEARNWREN_FIREBASE_WEB_API_KEY=op://learnwren/Web SDK Config/apiKey

LEARNWREN_CORS_ORIGINS=https://learnwren.com,https://www.learnwren.com,https://learn-wren.web.app,https://learn-wren.firebaseapp.com

# PHASED VALUE (vault-held): LEARNWREN_PUBLIC_URL pins the GCS resumable-upload
# session origin (video-storage.adapter.ts) — browser VIDEO uploads only work
# from a page origin byte-equal to it (bucket CORS does NOT override the
# session origin). It also drives email links. Start as
# https://learn-wren.web.app (Phases B-C); flip to https://learnwren.com in
# Phase D once the custom domain serves, then redeploy functions.
LEARNWREN_PUBLIC_URL=op://learnwren/prod/LEARNWREN_PUBLIC_URL

LEARNWREN_EMAIL_TRANSPORT=smtp
LEARNWREN_EMAIL_FROM=noreply@learnwren.com
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=op://learnwren/prod/SMTP_USER

LEARNWREN_VIDEO_TRANSCODER=gcp
LEARNWREN_VIDEO_SOURCE_BUCKET=learn-wren-video-source
LEARNWREN_VIDEO_OUTPUT_BUCKET=learn-wren-video-output
LEARNWREN_GCP_PROJECT_ID=learn-wren
LEARNWREN_TRANSCODER_LOCATION=us-central1
# Full resource path — transcoder JobConfig.pubsubDestination requires
# projects/{project}/topics/{name}, and the code passes this value raw.
LEARNWREN_TRANSCODER_TOPIC=projects/learn-wren/topics/learn-wren-transcoder-events-prod
LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE=op://learnwren/prod/LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE
LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL=learn-wren-transcoder-invoker@learn-wren.iam.gserviceaccount.com

LEARNWREN_MATERIALS_BUCKET=learn-wren-materials
LEARNWREN_COVER_STORAGE=firebase
LEARNWREN_COVER_BUCKET=learn-wren-cover
LEARNWREN_COVER_PUBLIC_BASE_URL=https://storage.googleapis.com/learn-wren-cover
LEARNWREN_PICTURE_STORAGE=firebase
LEARNWREN_PICTURE_BUCKET=learn-wren-picture
LEARNWREN_PICTURE_PUBLIC_BASE_URL=https://storage.googleapis.com/learn-wren-picture
```

- [ ] **Step 2: Add the render script, rename the deploy script, add the gitignore entry**

In `package.json`, after the `"secrets:render"` line, add:

```json
    "secrets:render:deploy": "op inject -i .env.deploy.tpl -o .env.learn-wren",
```

Also RENAME the `"deploy"` script to `"deploy:prod"` (same value — `firebase deploy --config firebase.deploy.json -P production`). **`deploy` is a pnpm BUILT-IN command** that shadows package scripts: on this workspace's pnpm 10.33.2, `pnpm deploy` runs the builtin ("Deploy a package from a workspace") and exits with `ERR_PNPM_NOTHING_TO_DEPLOY` — the firebase script never executes. `deploy:preview` is not a builtin name and stays as-is.

In `.gitignore`, extend the rendered-secrets block (lines 35–36) to:

```
# Rendered secrets — never commit. .env.tpl / .env.deploy.tpl are the sources of truth.
.env
.env.learn-wren
```

- [ ] **Step 3: Extend `tools/deploy/patch-functions-package.mjs`**

Replace the import line and append the new section. New import line:

```js
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
```

Add immediately after `const __dirname = …`:

```js
const requireDeployEnv = process.argv.includes('--require-deploy-env');
```

Append at the end of the file (after the existing `if (changed) { … } else { … }` block):

```js
// ── Deploy env delivery ──────────────────────────────────────────────────
// `firebase deploy` reads dotenv files (.env.<projectId>) from the functions
// SOURCE directory. The webpack build wipes dist/apps/api (output.clean:true),
// so the rendered env file must be copied in AFTER the build — i.e. here.
const distDir = resolve(__dirname, '../../dist/apps/api');
const envSrc = resolve(__dirname, '../../.env.learn-wren');
if (existsSync(envSrc)) {
  copyFileSync(envSrc, resolve(distDir, '.env.learn-wren'));
  console.log('[patch-functions-package] Copied .env.learn-wren into dist/apps/api/');
} else if (requireDeployEnv) {
  console.error(
    '[patch-functions-package] FATAL: .env.learn-wren not found at the repo root.\n' +
      '  A production deploy without runtime env crashes at boot (prod guards).\n' +
      '  Render it first: pnpm secrets:render:deploy',
  );
  process.exit(1);
} else {
  console.warn(
    '[patch-functions-package] WARNING: .env.learn-wren not found — env copy skipped ' +
      '(fine for local smoke runs; required for pnpm deploy:prod).',
  );
}

// Emulator-only secret placeholder: lets the functions emulator (pnpm smoke)
// resolve the `secrets: ['SMTP_PASS']` binding without Cloud Secret Manager.
// Real deploys ignore .secret.local; the placeholder value is not sensitive.
writeFileSync(resolve(distDir, '.secret.local'), 'SMTP_PASS=smoke-placeholder\n', 'utf8');
console.log('[patch-functions-package] Wrote dist/apps/api/.secret.local (emulator-only)');
```

Also update the file-header comment block (lines 1–15) to mention the two new behaviors — add to the bullet list:

```js
 *  - copies .env.learn-wren (rendered via `pnpm secrets:render:deploy`) into
 *    dist/apps/api so `firebase deploy` picks it up as gen2 runtime env; with
 *    --require-deploy-env (the deploy predeploy chain) a missing file is fatal
 *  - writes dist/apps/api/.secret.local so the functions emulator can resolve
 *    the SMTP_PASS secret binding during `pnpm smoke`
```

- [ ] **Step 4: Wire the flag into the deploy predeploy chain**

In `firebase.deploy.json`, change the functions predeploy entry (line 16):

```json
      "predeploy": [
        "pnpm exec nx build api --configuration=production --skip-nx-cache",
        "node tools/deploy/patch-functions-package.mjs --require-deploy-env"
      ]
```

- [ ] **Step 5: Verify the three patch-script behaviors**

```bash
# (a) flag + missing file → fatal exit 1
node tools/deploy/patch-functions-package.mjs --require-deploy-env; echo "exit=$?"
# Expected: FATAL message, exit=1

# (b) no flag + missing file → warning, exit 0
node tools/deploy/patch-functions-package.mjs; echo "exit=$?"
# Expected: WARNING message, exit=0, dist/apps/api/.secret.local exists

# (c) file present → copied
printf 'NODE_ENV=production\n' > .env.learn-wren
node tools/deploy/patch-functions-package.mjs --require-deploy-env; echo "exit=$?"
cat dist/apps/api/.env.learn-wren
rm .env.learn-wren
# Expected: exit=0 and the file contents echoed
```

(If `dist/apps/api/package.json` is missing, run `pnpm exec nx build api --configuration=production --skip-nx-cache` first — the script exits 1 with that instruction.)

- [ ] **Step 6: Verify the smoke harness end-to-end**

```bash
pnpm exec nx build api --configuration=production --skip-nx-cache
node tools/deploy/patch-functions-package.mjs
pnpm exec nx build web --configuration=production --skip-nx-cache
pnpm smoke
```

Expected: `pnpm smoke` exits 0 with smoke-assert reporting `N passed, 0 failed` (don't pin N — the harness currently runs ~11 checks). The new `.secret.local` lets the emulator resolve the `SMTP_PASS` binding; no `.env.learn-wren` is needed because smoke's project is `demo-learnwren-smoke`, which never matches `.env.learn-wren`.
NOTE: nuke `dist/` and use `NX_DAEMON=false` if builds behave strangely in the worktree (known stale-tsbuildinfo hazard).

- [ ] **Step 7: Commit**

```bash
git add .env.deploy.tpl tools/deploy/patch-functions-package.mjs package.json .gitignore firebase.deploy.json
git commit -m "feat(deploy): gen2 runtime env via .env.learn-wren dotenv delivery

Rendered from 1Password (secrets:render:deploy), copied into dist/apps/api
post-build by the patch script (webpack clean wipes anything earlier);
--require-deploy-env makes a missing file fatal in the deploy chain only.
.secret.local placeholder keeps pnpm smoke working with the secret binding.
Also renames the deploy script to deploy:prod — pnpm's builtin deploy
command shadows package scripts (pnpm deploy never ran firebase deploy)."
```

---

## Task 6: Bucket CORS policies + verifier `--preflight-put` mode

Materials uploads are browser XHR PUTs with a `Content-Type` header to v4 signed URLs — always preflighted, answered from bucket CORS (the 2026-05-31 audit only covered downloads). The source bucket gets a defensive policy too (resumable-session `origin` behavior is under-documented). The output-bucket policy gains the custom-domain origins.

**Files:**
- Modify: `tools/deploy/gcs-cors.json`
- Create: `tools/deploy/gcs-cors-materials.json`
- Create: `tools/deploy/gcs-cors-source.json`
- Modify: `tools/deploy/verify-gcs-cors.mjs:53-105,210-252`

- [ ] **Step 1: Update `tools/deploy/gcs-cors.json` (video output) with the new origins**

```json
[
  {
    "origin": [
      "https://learnwren.com",
      "https://www.learnwren.com",
      "https://learn-wren.web.app",
      "https://learn-wren.firebaseapp.com"
    ],
    "method": ["GET", "HEAD", "OPTIONS"],
    "responseHeader": ["Content-Type", "Range"],
    "maxAgeSeconds": 3600
  }
]
```

- [ ] **Step 2: Create `tools/deploy/gcs-cors-materials.json`**

```json
[
  {
    "origin": [
      "https://learnwren.com",
      "https://www.learnwren.com",
      "https://learn-wren.web.app",
      "https://learn-wren.firebaseapp.com"
    ],
    "method": ["PUT", "OPTIONS"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

- [ ] **Step 3: Create `tools/deploy/gcs-cors-source.json`**

```json
[
  {
    "origin": [
      "https://learnwren.com",
      "https://www.learnwren.com",
      "https://learn-wren.web.app",
      "https://learn-wren.firebaseapp.com"
    ],
    "method": ["PUT", "OPTIONS"],
    "responseHeader": ["Content-Type", "Content-Range"],
    "maxAgeSeconds": 3600
  }
]
```

- [ ] **Step 4: Add `--preflight-put` to `verify-gcs-cors.mjs`**

Replace the whole `parseArgs` function (lines 53–77) with:

```js
function parseArgs(argv) {
  const positionals = [];
  let origin = DEFAULT_ORIGIN;
  let endpoint;
  let preflightPut = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--origin') {
      origin = argv[++i];
      if (origin === undefined) return { error: '--origin requires a value' };
    } else if (arg === '--endpoint') {
      endpoint = argv[++i];
      if (endpoint === undefined) return { error: '--endpoint requires a value' };
    } else if (arg === '--preflight-put') {
      preflightPut = true;
    } else if (arg === '-h' || arg === '--help') {
      return { help: true };
    } else if (arg.startsWith('--')) {
      return { error: `unknown flag ${arg}` };
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 1) {
    return { error: 'exactly one <target> (object URL or bucket name) is required' };
  }
  return { target: positionals[0], origin, endpoint, preflightPut };
}
```

Add this function after `checkPreflight` (after line 208):

```js
async function checkUploadPreflight(url, origin) {
  // Browser material uploads are XHR PUTs with a Content-Type header to a v4
  // signed URL — always preflighted; GCS answers from the bucket CORS policy.
  let res;
  try {
    res = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
      },
      redirect: 'manual',
    });
  } catch (err) {
    return { pass: false, detail: `preflight request failed: ${err.message}` };
  }
  try {
    await res.arrayBuffer();
  } catch {
    /* ignore */
  }
  const problems = [];
  if (res.status < 200 || res.status >= 300) {
    problems.push(`preflight status ${res.status} is not 2xx`);
  }
  const acao = header(res.headers, 'access-control-allow-origin');
  if (!acaoAllows(acao, origin)) {
    problems.push(
      acao
        ? `access-control-allow-origin "${acao}" does not authorize "${origin}"`
        : 'access-control-allow-origin missing on preflight',
    );
  }
  const allowMethods = header(res.headers, 'access-control-allow-methods') ?? '';
  if (!/\bPUT\b/i.test(allowMethods)) {
    problems.push(
      allowMethods
        ? `access-control-allow-methods "${allowMethods}" does not include PUT`
        : 'access-control-allow-methods missing PUT',
    );
  }
  const allowHeaders = header(res.headers, 'access-control-allow-headers') ?? '';
  if (!/\bcontent-type\b/i.test(allowHeaders)) {
    problems.push(
      allowHeaders
        ? `access-control-allow-headers "${allowHeaders}" does not allow Content-Type`
        : 'access-control-allow-headers does not allow Content-Type',
    );
  }
  if (problems.length > 0) return { pass: false, detail: problems.join('; ') };
  return {
    pass: true,
    detail: `preflight 2xx; allow-origin: ${acao}; allow-methods: ${allowMethods}; allow-headers: ${allowHeaders}`,
  };
}
```

In `main()` (lines 227–236), branch on the mode:

```js
  const results = [];

  if (parsed.preflightPut) {
    const putResult = await checkUploadPreflight(url, origin);
    results.push([
      '(a) OPTIONS preflight (Request-Method PUT, Request-Headers content-type) → 2xx + ACAO + allow PUT/Content-Type',
      putResult,
    ]);
  } else {
    const getResult = await checkSimpleGet(url, origin);
    results.push(['(a) GET with Origin → ACAO present and matches', getResult]);

    const preflightResult = await checkPreflight(url, origin);
    results.push([
      '(b) OPTIONS preflight (Request-Method GET, Request-Headers range) → 2xx + ACAO + allow GET/Range',
      preflightResult,
    ]);
  }
```

Update `applyCmdHint` (lines 99–105) to take the mode into account:

```js
function applyCmdHint(origin, preflightPut) {
  const bucketEnv = preflightPut ? 'LEARNWREN_MATERIALS_BUCKET' : 'LEARNWREN_VIDEO_OUTPUT_BUCKET';
  const corsFile = preflightPut ? 'tools/deploy/gcs-cors-materials.json' : CORS_FILE_PATH;
  return [
    'HINT — apply the bucket CORS policy, then re-run this verifier:',
    `  gcloud storage buckets update gs://$${bucketEnv} --cors-file=${corsFile}`,
    `  (ensure ${corsFile} lists "${origin}" under "origin")`,
  ].join('\n');
}
```

…and its call site: `process.stdout.write(`\n${applyCmdHint(origin, parsed.preflightPut)}\n`);`
Also update the usage text (lines 41–50) to document `--preflight-put   Assert a materials-upload PUT preflight instead of the segment GET checks.`

- [ ] **Step 5: Verify flag parsing and JSON validity**

```bash
node -e "for (const f of ['tools/deploy/gcs-cors.json','tools/deploy/gcs-cors-materials.json','tools/deploy/gcs-cors-source.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('json ok')"
node tools/deploy/verify-gcs-cors.mjs --help; echo "exit=$?"
node tools/deploy/verify-gcs-cors.mjs some-bucket --preflight-put --origin https://learnwren.com; echo "exit=$?"
```

Expected: `json ok`; help exits 2; the third command runs the single PUT-preflight check against `https://storage.googleapis.com/some-bucket/__cors-probe__` and FAILS (exit 1) with the materials-bucket hint — correct, since no policy exists on a nonexistent bucket. (Network access required; the assertion here is that it runs the PUT path and prints the new hint.)

- [ ] **Step 6: Commit**

```bash
git add tools/deploy/gcs-cors.json tools/deploy/gcs-cors-materials.json tools/deploy/gcs-cors-source.json tools/deploy/verify-gcs-cors.mjs
git commit -m "feat(deploy): custom-domain CORS origins + materials/source policies

Materials uploads are preflighted browser PUTs (the 2026-05-31 audit only
covered downloads) — new gcs-cors-materials.json + --preflight-put verifier
mode. Source bucket gets a defensive PUT policy; output policy gains
learnwren.com origins."
```

---

## Task 7: `tools/deploy/provision-buckets.sh`

**Files:**
- Create: `tools/deploy/provision-buckets.sh` (mode 755)

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
# One-time-per-environment GCS provisioning for Learn Wren production.
# Idempotent: safe to re-run. Requires: gcloud CLI authenticated as a
# project owner (gcloud auth login; gcloud config set project learn-wren).
#
# Creates the 5 app buckets, applies CORS, grants the function runtime SA
# and the Transcoder service agent, and enables the required APIs — incl.
# iamcredentials.googleapis.com + the runtime SA's tokenCreator self-grant,
# without which v4 signed-URL minting 500s (ADC has no private key; signing
# goes through the IAM Credentials signBlob API).
#
# Usage: PROJECT_ID=learn-wren REGION=us-central1 tools/deploy/provision-buckets.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

PROJECT_ID="${PROJECT_ID:-learn-wren}"
REGION="${REGION:-us-central1}"

PRIVATE_BUCKETS=("${PROJECT_ID}-video-source" "${PROJECT_ID}-video-output" "${PROJECT_ID}-materials")
PUBLIC_BUCKETS=("${PROJECT_ID}-cover" "${PROJECT_ID}-picture")

PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
TRANSCODER_SA="service-${PROJECT_NUMBER}@gcp-sa-transcoder.iam.gserviceaccount.com"

echo "== Enabling required APIs =="
gcloud services enable transcoder.googleapis.com pubsub.googleapis.com \
  iamcredentials.googleapis.com secretmanager.googleapis.com --project "${PROJECT_ID}"

create_bucket() { # <name> [extra create flags...]
  local name="$1"
  shift
  if gcloud storage buckets describe "gs://${name}" >/dev/null 2>&1; then
    echo "   gs://${name} already exists — skipping create"
  else
    gcloud storage buckets create "gs://${name}" --project "${PROJECT_ID}" \
      --location "${REGION}" --uniform-bucket-level-access "$@"
  fi
}

echo "== Private buckets (signed-URL / service-agent access only) =="
for b in "${PRIVATE_BUCKETS[@]}"; do
  create_bucket "${b}" --public-access-prevention
done

echo "== Public buckets (cover/picture: allUsers read via storage.googleapis.com) =="
for b in "${PUBLIC_BUCKETS[@]}"; do
  create_bucket "${b}"
  gcloud storage buckets add-iam-policy-binding "gs://${b}" \
    --member=allUsers --role=roles/storage.objectViewer >/dev/null
  echo "   gs://${b}: allUsers objectViewer granted"
done

echo "== Bucket CORS =="
gcloud storage buckets update "gs://${PROJECT_ID}-video-output" --cors-file=tools/deploy/gcs-cors.json
gcloud storage buckets update "gs://${PROJECT_ID}-materials" --cors-file=tools/deploy/gcs-cors-materials.json
gcloud storage buckets update "gs://${PROJECT_ID}-video-source" --cors-file=tools/deploy/gcs-cors-source.json

echo "== Runtime SA bucket grants (${RUNTIME_SA}) =="
for b in "${PRIVATE_BUCKETS[@]}" "${PUBLIC_BUCKETS[@]}"; do
  gcloud storage buckets add-iam-policy-binding "gs://${b}" \
    --member="serviceAccount:${RUNTIME_SA}" --role=roles/storage.objectAdmin >/dev/null
  echo "   gs://${b}: objectAdmin granted"
done

echo "== Runtime SA self-grant for v4 URL signing (signBlob) =="
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role=roles/iam.serviceAccountTokenCreator --project "${PROJECT_ID}" >/dev/null
echo "   ${RUNTIME_SA}: tokenCreator on itself granted"

echo "== Transcoder service agent =="
# Needs the gcloud beta component — fail loudly, or the silent failure below
# surfaces later as a misleading 'service account does not exist'.
if ! gcloud beta --help >/dev/null 2>&1; then
  echo "FATAL: gcloud beta component missing — run: gcloud components install beta --quiet" >&2
  exit 1
fi
# Pre-provision the agent — it otherwise only exists after the first job
# (with up to ~7 min delay), and the bucket bindings below would fail.
# '|| true': re-runs return ALREADY_EXISTS, which is fine (idempotent).
gcloud beta services identity create --service=transcoder.googleapis.com \
  --project "${PROJECT_ID}" || true
gcloud storage buckets add-iam-policy-binding "gs://${PROJECT_ID}-video-source" \
  --member="serviceAccount:${TRANSCODER_SA}" --role=roles/storage.objectViewer >/dev/null
# objectAdmin (not objectCreator): retried jobs overwrite the same output paths.
gcloud storage buckets add-iam-policy-binding "gs://${PROJECT_ID}-video-output" \
  --member="serviceAccount:${TRANSCODER_SA}" --role=roles/storage.objectAdmin >/dev/null
echo "   ${TRANSCODER_SA}: source objectViewer + output objectAdmin granted"

echo "Done. Buckets: ${PRIVATE_BUCKETS[*]} ${PUBLIC_BUCKETS[*]}"
```

- [ ] **Step 2: Make it executable and lint the syntax**

Run: `chmod +x tools/deploy/provision-buckets.sh && bash -n tools/deploy/provision-buckets.sh && echo "syntax ok"`
Expected: `syntax ok`. (Real execution happens in Task 11 — it needs gcloud + owner auth.)

- [ ] **Step 3: Commit**

```bash
git add tools/deploy/provision-buckets.sh
git commit -m "feat(deploy): idempotent GCS bucket provisioning script

5 buckets (3 private w/ PAP, 2 public), CORS, runtime-SA objectAdmin +
tokenCreator self-grant (v4 signing), Transcoder service-agent grants."
```

---

## Task 8: `tools/deploy/provision-pubsub.sh`

Gen2-correct replacement for the manual runbook: `roles/run.invoker` via `gcloud functions add-invoker-policy-binding`, push endpoint/audience derived from the deployed function's `serviceConfig.uri` (never hand-built `cloudfunctions.net`), and the Pub/Sub service-agent `tokenCreator` grant the old runbook omitted.

**Files:**
- Create: `tools/deploy/provision-pubsub.sh` (mode 755)

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
# One-time-per-environment Pub/Sub wiring for transcoder job events.
# RUN AFTER THE FIRST `pnpm deploy:prod` — it derives the push endpoint from the
# deployed gen2 function's run.app URL (serviceConfig.uri). Idempotent.
# Requires: gcloud CLI authenticated as a project owner.
#
# Usage: PROJECT_ID=learn-wren REGION=us-central1 ENV_SUFFIX=prod tools/deploy/provision-pubsub.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

PROJECT_ID="${PROJECT_ID:-learn-wren}"
REGION="${REGION:-us-central1}"
ENV_SUFFIX="${ENV_SUFFIX:-prod}"

TOPIC="learn-wren-transcoder-events-${ENV_SUFFIX}"
DEADLETTER="${TOPIC}-deadletter"
SUB="${TOPIC}-sub"
INVOKER_SA_NAME="learn-wren-transcoder-invoker"
INVOKER_SA="${INVOKER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
PUBSUB_AGENT="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"

# Gen2 function URL — never hand-build cloudfunctions.net (it may not exist
# for Firebase-deployed v2 functions). The same string is the OIDC audience.
FUNCTION_ORIGIN=$(gcloud functions describe api --region "${REGION}" \
  --project "${PROJECT_ID}" --format='value(serviceConfig.uri)')
if [[ -z "${FUNCTION_ORIGIN}" ]]; then
  echo "FATAL: cannot resolve the api function URL — has the first deploy run?" >&2
  exit 1
fi
PUSH_ENDPOINT="${FUNCTION_ORIGIN}/api/internal/transcoder-events"
echo "Push endpoint + OIDC audience: ${PUSH_ENDPOINT}"

ensure_topic() {
  gcloud pubsub topics describe "$1" --project "${PROJECT_ID}" >/dev/null 2>&1 ||
    gcloud pubsub topics create "$1" --project "${PROJECT_ID}"
}

echo "== Topics =="
ensure_topic "${TOPIC}"
ensure_topic "${DEADLETTER}"

echo "== Dead-letter triage subscription =="
gcloud pubsub subscriptions describe "${DEADLETTER}-sub" --project "${PROJECT_ID}" >/dev/null 2>&1 ||
  gcloud pubsub subscriptions create "${DEADLETTER}-sub" --topic="${DEADLETTER}" --project "${PROJECT_ID}"

echo "== Invoker service account =="
gcloud iam service-accounts describe "${INVOKER_SA}" --project "${PROJECT_ID}" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "${INVOKER_SA_NAME}" \
    --display-name="Learn Wren Transcoder Pub/Sub Invoker" --project "${PROJECT_ID}"

echo "== Pub/Sub service agent: mint OIDC tokens as the invoker SA =="
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${PUBSUB_AGENT}" \
  --role=roles/iam.serviceAccountTokenCreator >/dev/null
echo "   ${PUBSUB_AGENT}: project tokenCreator granted"

echo "== gen2 invoker grant (roles/run.invoker on the underlying Cloud Run service) =="
# NOTE: the function is public today (Hosting rewrite requirement), so this
# grant is forward-compatibility — PubSubPushGuard's OIDC checks are the
# actual security boundary.
gcloud functions add-invoker-policy-binding api --region "${REGION}" \
  --project "${PROJECT_ID}" --member="serviceAccount:${INVOKER_SA}"

echo "== Dead-letter forwarding grants =="
gcloud pubsub topics add-iam-policy-binding "${DEADLETTER}" \
  --member="serviceAccount:${PUBSUB_AGENT}" --role=roles/pubsub.publisher \
  --project "${PROJECT_ID}" >/dev/null

echo "== Push subscription =="
if gcloud pubsub subscriptions describe "${SUB}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "   ${SUB} already exists — skipping create (delete + re-run to change endpoint/audience)"
else
  gcloud pubsub subscriptions create "${SUB}" \
    --topic="${TOPIC}" --project "${PROJECT_ID}" \
    --push-endpoint="${PUSH_ENDPOINT}" \
    --push-auth-service-account="${INVOKER_SA}" \
    --push-auth-token-audience="${PUSH_ENDPOINT}" \
    --dead-letter-topic="${DEADLETTER}" \
    --max-delivery-attempts=5 \
    --min-retry-delay=10s --max-retry-delay=600s --ack-deadline=60
fi
gcloud pubsub subscriptions add-iam-policy-binding "${SUB}" \
  --member="serviceAccount:${PUBSUB_AGENT}" --role=roles/pubsub.subscriber \
  --project "${PROJECT_ID}" >/dev/null

cat <<EOF

== NEXT STEPS ==
Set these in the 1Password 'prod' vault item, re-render (pnpm secrets:render:deploy),
and redeploy the function (pnpm deploy:preview). The audience must match
LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE BYTE-FOR-BYTE (scheme/host/path).
  LEARNWREN_TRANSCODER_TOPIC=projects/${PROJECT_ID}/topics/${TOPIC}
  LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE=${PUSH_ENDPOINT}
  LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL=${INVOKER_SA}
EOF
```

- [ ] **Step 2: Make it executable and lint the syntax**

Run: `chmod +x tools/deploy/provision-pubsub.sh && bash -n tools/deploy/provision-pubsub.sh && echo "syntax ok"`
Expected: `syntax ok`. (Real execution happens in Task 13.)

- [ ] **Step 3: Commit**

```bash
git add tools/deploy/provision-pubsub.sh
git commit -m "feat(deploy): gen2-correct Pub/Sub transcoder-events provisioning script

run.invoker (not cloudfunctions.invoker), endpoint+audience from
serviceConfig.uri, Pub/Sub service-agent tokenCreator grant, dead-letter
wiring. Replaces the gen1-style manual runbook commands."
```

---

## Task 9: Docs reconciliation

**Files:**
- Modify: `docs/deployment.md` (env mechanism §, env table row, "Not done yet" §, custom domain runbook)
- Rewrite: `docs/operations/transcoder-pubsub-setup.md`
- Modify: `docs/security.md:83-86,158-177`
- Modify: `docs/secrets.md` (vault contract rows, daily workflow)

- [ ] **Step 1: `docs/deployment.md` — replace the env-mechanism intro (lines 69–73)**

Replace the paragraph under `## Required environment variables` ("The following variables must be set … via `firebase functions:config:set` or Firebase console …") with:

```markdown
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
```

- [ ] **Step 2: `docs/deployment.md` — fix the deploy commands and env table rows**

- In the "Deploy commands" section (lines 43–59): change `pnpm deploy` to `pnpm deploy:prod` (both the command and the comment), keeping `pnpm deploy:preview` as-is, and add the note: `The script is named deploy:prod because 'deploy' is a pnpm builtin that shadows package scripts (pnpm deploy exits with ERR_PNPM_NOTHING_TO_DEPLOY without ever running firebase).`
- Line 82: change `` `FIREBASE_WEB_API_KEY` `` to `` `LEARNWREN_FIREBASE_WEB_API_KEY` ``.
- In the Email-transport table, change the `SMTP_PORT` row's purpose cell to: `SMTP port — use 587 (STARTTLS). For SES the password is region-derived from the IAM secret key, not the secret key itself; credentials are per-region.`
- Change the `LEARNWREN_PUBLIC_URL` row's purpose cell to: `Base URL for email links AND the pinned origin of GCS resumable video-upload sessions — browser video uploads only succeed from a page origin byte-equal to this value (bucket CORS does not override the session origin). Phased: https://learn-wren.web.app until the custom domain serves, then https://learnwren.com.`
- In the cover/picture storage tables, add the two adapter-selection rows:

```markdown
| `LEARNWREN_COVER_STORAGE` | Must be `firebase` in production (defaults to it; explicit `fake` is rejected at boot). |
| `LEARNWREN_PICTURE_STORAGE` | Must be `firebase` in production (defaults to it; explicit `fake` is rejected at boot). |
```

- [ ] **Step 3: `docs/deployment.md` — replace the "Not done yet" section (and its intro pointer)**

Also rewrite the intro blockquote (lines 6–7, "This slice wires the deploy mechanism. The first real deploy has not been performed yet — see [Not done yet](#not-done-yet)…") to point at the renamed section: `> Deploy mechanism + production runbook — see [Production setup status](#production-setup-status) for what is scripted vs. manual.` (Task 15 updates the wording again once the deploy has actually happened.)

Replace the whole `## Not done yet` section with:

```markdown
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
```

- [ ] **Step 4: `docs/deployment.md` — expand the custom-domain item into a runbook section**

Replace the old "Custom domain (optional): …" numbered item (formerly in "Not done yet") with a new top-level section appended after the smoke-test section:

```markdown
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
```

- [ ] **Step 5: Rewrite `docs/operations/transcoder-pubsub-setup.md`**

Replace the entire file content with:

```markdown
# Transcoder Pub/Sub Setup — gen2

One-time operational task per environment. CI and local dev use
`LEARNWREN_VIDEO_TRANSCODER=fake` and need none of this.

**The executable form of this runbook is `tools/deploy/provision-pubsub.sh`**
(idempotent; run as `PROJECT_ID=learn-wren REGION=us-central1 ENV_SUFFIX=prod
tools/deploy/provision-pubsub.sh`). This document explains what it does and why.

## Prerequisites

- `gcloud` CLI authenticated as a project owner.
- The `api` function deployed at least once (`pnpm deploy:prod`) — the push
  endpoint derives from the live function URL.
- Buckets + Transcoder service-agent grants provisioned
  (`tools/deploy/provision-buckets.sh`).

## What the script does (gen2-corrected)

1. **Topics**: `learn-wren-transcoder-events-<env>` plus a dead-letter topic
   and a pull triage subscription on the dead-letter.
2. **Invoker SA**: `learn-wren-transcoder-invoker@<project>.iam.gserviceaccount.com`.
3. **Pub/Sub service agent grant**: `service-<projectNumber>@gcp-sa-pubsub.iam.gserviceaccount.com`
   gets `roles/iam.serviceAccountTokenCreator` (required to mint the OIDC
   push tokens — omitted from the old gen1 runbook).
4. **Invoker grant (gen2)**: `gcloud functions add-invoker-policy-binding api`
   — grants `roles/run.invoker` on the function's underlying Cloud Run
   service. The old `gcloud functions add-iam-policy-binding …
   --role=roles/cloudfunctions.invoker` does **not** gate gen2 invocation.
   Note: the function is public anyway (Firebase Hosting rewrite requirement),
   so the in-app `PubSubPushGuard` OIDC validation — not IAM — is the real
   security boundary; the grant is forward-compatibility.
5. **Push endpoint + audience**: derived from
   `gcloud functions describe api --format='value(serviceConfig.uri)'` —
   the run.app URL. Never hand-build
   `https://<region>-<project>.cloudfunctions.net/api`: Firebase-deployed v2
   functions sometimes have no cloudfunctions.net endpoint, and the path
   shape differs. The push endpoint is
   `<serviceConfig.uri>/api/internal/transcoder-events` and the **same exact
   string** is the OIDC token audience.
6. **Push subscription** with OIDC auth, dead-letter after 5 attempts,
   retry backoff 10s–600s, ack deadline 60s.

The topic is wired into each job via `JobConfig.config.pubsubDestination` at
submit time — no global Transcoder setting exists.

## Matching the runtime env

The guard (`libs/api-courses/src/lib/video/webhook/pubsub-push.guard.ts`)
validates: token signature, `iss === https://accounts.google.com`, unexpired,
`aud` **byte-equal** to `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE` (scheme, host,
path, trailing slash), `email === LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL`, and
`email_verified === true`. The script prints the three env values to put in
the 1Password `prod` item; re-render and `pnpm deploy:preview` after wiring.

## Verification

```bash
gcloud pubsub subscriptions describe learn-wren-transcoder-events-prod-sub \
  --format='value(pushConfig.pushEndpoint, pushConfig.oidcToken.serviceAccountEmail)'
```

Expected: push endpoint matches `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE`; SA
matches `LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL`. Then run one real video
through upload → transcode → playback and confirm the dead-letter
subscription stays empty:

```bash
gcloud pubsub subscriptions pull learn-wren-transcoder-events-prod-deadletter-sub --limit=5
```

## Tearing down

```bash
gcloud pubsub subscriptions delete learn-wren-transcoder-events-prod-sub
gcloud pubsub subscriptions delete learn-wren-transcoder-events-prod-deadletter-sub
gcloud pubsub topics delete learn-wren-transcoder-events-prod-deadletter
gcloud pubsub topics delete learn-wren-transcoder-events-prod
gcloud iam service-accounts delete learn-wren-transcoder-invoker@learn-wren.iam.gserviceaccount.com
```

## Output bucket CORS

Applied by `tools/deploy/provision-buckets.sh` from `tools/deploy/gcs-cors.json`
(video output: GET/HEAD; materials: PUT preflight via
`gcs-cors-materials.json`; source: PUT via `gcs-cors-source.json`). Verify
with `node tools/deploy/verify-gcs-cors.mjs '<signed-segment-url>'` and
`node tools/deploy/verify-gcs-cors.mjs <materials-bucket> --preflight-put`.
```

- [ ] **Step 6: Amend `docs/security.md`**

(a) Replace the materials bullet (line 84, "**Materials** are delivered as signed object URLs … needs no CORS policy.") with:

```markdown
  - **Materials downloads** are signed object URLs opened via top-level navigation — `window.open(downloadUrl, '_blank', 'noopener')` on the learn page (`libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts:293`) and an `<a download>` click in the authoring UI. Navigations are not subject to CORS. **Materials *uploads*, however, ARE cross-origin XHR PUTs** with a `Content-Type` header to v4 signed URLs (`libs/web-courses/src/lib/materials/material-upload.service.ts`) — always preflighted, answered from bucket CORS. *(Corrected 2026-06-10: the 2026-05-31 audit analyzed only downloads.)* The materials bucket therefore carries a PUT/OPTIONS CORS policy (`tools/deploy/gcs-cors-materials.json`); the video **source** bucket carries a defensive PUT policy too (`gcs-cors-source.json` — resumable-session `origin` behavior is under-documented).
```

(b) Replace the "Net:" bullet (line 86) with:

```markdown
  - Net: three buckets carry CORS policies — `$LEARNWREN_VIDEO_OUTPUT_BUCKET` (`tools/deploy/gcs-cors.json`, segment GETs), `$LEARNWREN_MATERIALS_BUCKET` (`gcs-cors-materials.json`, upload PUTs), `$LEARNWREN_VIDEO_SOURCE_BUCKET` (`gcs-cors-source.json`, resumable upload PUTs). Cover/picture buckets need none.
```

(c) In the open-items section (lines 158–177), update the apply/verify commands to mention `tools/deploy/provision-buckets.sh` as the apply mechanism and add after the verifier line: `` node tools/deploy/verify-gcs-cors.mjs "$LEARNWREN_MATERIALS_BUCKET" --preflight-put `` — and note the policy files already include the `https://learnwren.com` / `https://www.learnwren.com` origins.

- [ ] **Step 7: Amend `docs/secrets.md`**

(a) In "Daily workflow", after the `pnpm secrets:render` block, add:

```markdown
Render the production deploy env (`.env.learn-wren`, consumed by `pnpm deploy:prod`):

```bash
pnpm secrets:render:deploy
```
```

(b) In the vault-contract table, the `Web SDK Config` row was renamed in Task 1. Add new rows:

```markdown
| `prod` | `SMTP_USER` | same | SES SMTP access key id (us-east-1; the SMTP password lives in Cloud Secret Manager, NOT in the vault/env) | production deploys |
| `prod` | `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE` | same | Exact push-endpoint URL (`<serviceConfig.uri>/api/internal/transcoder-events`) — printed by `tools/deploy/provision-pubsub.sh` | production deploys |
```

(c) After the table, add the note: `The production deploy template is `.env.deploy.tpl` → rendered to `.env.learn-wren` (gitignored). Non-secret production values (bucket names, origins, project IDs) are committed literals in the template; only genuinely secret/varying values go through `op://` references.`

- [ ] **Step 8: Verify docs consistency and commit**

Run: `grep -n "functions:config:set" docs/deployment.md; grep -n "cloudfunctions.invoker" docs/operations/transcoder-pubsub-setup.md; grep -c "learnwren.com" docs/deployment.md; grep -n "pnpm deploy[^:]" docs/deployment.md`
Expected: the first grep returns exactly ONE line — the "Do **not** use `firebase functions:config:set`" warning (any other hit is a leftover affirmative instruction — fix it); the second returns exactly ONE line — the "does **not** gate gen2 invocation" warning; the third returns ≥ 5; the fourth returns NOTHING (every runnable invocation now says `pnpm deploy:prod` or `pnpm deploy:preview`).

```bash
git add docs/deployment.md docs/operations/transcoder-pubsub-setup.md docs/security.md docs/secrets.md
git commit -m "docs: reconcile deploy/ops/security docs with gen2 reality

deployment.md: dotenv+secrets is the only gen2 env mechanism (kills the
functions:config:set / console-env claims), custom-domain runbook.
transcoder-pubsub-setup.md: gen2 rewrite around provision-pubsub.sh.
security.md: materials-upload CORS correction. secrets.md: prod vault rows."
```

---

## Task 10: Branch verification + merge to main

- [ ] **Step 1: Full affected gates**

Run (from the worktree): `pnpm affected --base=main`
Expected: lint, test, build, typecheck all green for affected projects (`api-firebase`, `api-auth`, `api-courses`, `api`, …).

- [ ] **Step 2: API e2e suite**

Run: `pnpm exec nx run api-e2e:e2e`
Expected: green (the firestore-rules static guard still passes — the predeploy flag change keeps the same rules files). Probe first that nothing is already bound to :3333; abort and investigate if so.

- [ ] **Step 3: Merge `--no-ff` from the main checkout**

From `/Volumes/Artie-Storage/github-repos/learnwren` (NOT the worktree): verify the worktree is clean (`git -C ../learnwren-deploy-prod status`), then:

```bash
git merge --no-ff feat/deploy-prod -m "Merge feat/deploy-prod: production-deploy repo changes

4 production-blocking fixes (FIREBASE_ reserved-prefix env rename,
PubSubPushGuard verifyIdToken call shape, SMTP TLS mode, cover/picture
silent-fake-adapter guard), gen2 dotenv env delivery, deploy script renamed
deploy:prod (pnpm builtin shadows the old name), bucket CORS policies
(incl. materials upload gap), provisioning scripts, docs reconciliation.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Then check `git status` in the worktree before `git worktree remove ../learnwren-deploy-prod` (status-check first; never `--force` blindly).

---

## Task 11: Phase A — provisioning with no deployed function (interactive)

Run from the main checkout after the Task 10 merge. Console/AWS steps are the user's; CLI steps are pasteable.

- [ ] **Step 1: Install + authenticate gcloud**

```bash
brew update && brew install --cask gcloud-cli
gcloud auth login
gcloud config set project learn-wren
gcloud components install beta --quiet
gcloud projects describe learn-wren --format='value(projectNumber)'
```
Expected: the last command prints `62659829157`. (The beta component is needed by `provision-buckets.sh`'s `gcloud beta services identity create`.)

Also authenticate the Firebase CLI — separate from gcloud auth, and this machine has only ever used the emulators:

```bash
pnpm exec firebase login          # skip if already logged in (firebase login:list shows bflan1972@gmail.com)
pnpm exec firebase projects:list 2>/dev/null | grep learn-wren
```
Expected: the `learn-wren` project row appears.

- [ ] **Step 2: Run the bucket provisioning script**

Run: `PROJECT_ID=learn-wren REGION=us-central1 tools/deploy/provision-buckets.sh`
Expected: APIs enabled; 5 buckets created; 3 CORS policies applied; runtime-SA grants + tokenCreator self-grant; Transcoder service-agent grants. If the Transcoder agent bindings fail with "service account does not exist", wait ~2 minutes and re-run (idempotent).

- [ ] **Step 3: Console one-timers (user, Firebase console)**

- Storage → Get started: provision the default bucket (`learn-wren.firebasestorage.app`) — required or the `storage` rules deploy target errors.
- Verify Firestore exists (Native mode) and Authentication has Email/Password enabled (expected done since 2026-04-30 — verify only).

- [ ] **Step 4: SES setup (user, AWS console, us-east-1)**

1. SES → Verified identities → Create identity → Domain `learnwren.com`, Easy DKIM (2048), check **Publish DNS records to Route 53**. Wait for "Verified" (usually minutes with auto-published CNAMEs).
2. **Submit production access request now** (Account dashboard → Request production access): mail type *Transactional*, website `https://learnwren.com`, describe password-reset/verification/course-notification emails, note bounce/complaint handling via SES account-level suppression. (Typically <24 h — the long pole.)
3. SMTP settings → Create SMTP credentials (IAM user e.g. `learnwren-smtp`). Record the SMTP username + password (the password is region-derived, NOT the IAM secret key).
4. Route 53 → hosted zone `learnwren.com` → add TXT record `_dmarc.learnwren.com` with value `"v=DMARC1; p=none; rua=mailto:bflan1972@gmail.com"`.

- [ ] **Step 5: Store secrets**

```bash
pnpm exec firebase functions:secrets:set SMTP_PASS -P production
# paste the SES SMTP password when prompted
```
In 1Password vault `learnwren`: create item `prod` with fields `SMTP_USER` (SES SMTP username), `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE` (placeholder `https://placeholder.invalid/api/internal/transcoder-events` until Task 13), and `LEARNWREN_PUBLIC_URL` = `https://learn-wren.web.app` (flipped to `https://learnwren.com` in Task 14 — it pins video-upload session origins, so it must match where you actually browse).

- [ ] **Step 6: Render the deploy env**

Run: `pnpm secrets:render:deploy && grep -c '^LEARNWREN_\|^NODE_ENV\|^SMTP_' .env.learn-wren`
Expected: renders without error; 26 var lines; spot-check `grep 'LEARNWREN_FIREBASE_WEB_API_KEY\|LEARNWREN_PUBLIC_URL' .env.learn-wren` shows a real key and `https://learn-wren.web.app` (no `op://` residue).

---

## Task 12: Phase B — first deploy (interactive)

- [ ] **Step 1: Deploy**

Run: `pnpm deploy:prod` (NOT `pnpm deploy` — that's the pnpm builtin, which fails with `ERR_PNPM_NOTHING_TO_DEPLOY`)
Expected: predeploy builds api + web, patch script logs the env copy, functions + hosting + rules deploy succeeds. First gen2 deploy can take several minutes (Cloud Build).

- [ ] **Step 2: Smoke the deployed app**

```bash
curl -s https://learn-wren.web.app/api/health
# Expected: HTTP 200, JSON containing "status":"ok" (also carries version + serverTime)
```
Manual on `https://learn-wren.web.app`: register (use a mailbox you can check — note: until SES production access, only SES-verified recipients get email; verify your own address in SES first), login (session cookie), create + publish a course, upload a cover image and confirm it renders from `https://storage.googleapis.com/learn-wren-cover/...` (proves the real adapter, not the fake), upload a lesson material (exercises the new materials CORS). Video upload is verified in Task 13 (`LEARNWREN_PUBLIC_URL` pins upload-session origins to web.app at this stage).

- [ ] **Step 2b: Bootstrap the production admin and verify the admin surface**

```bash
gcloud auth application-default login   # ADC for the local script (one-time)
LEARNWREN_FIREBASE_TARGET=production LEARNWREN_API_FIREBASE_PROJECT_ID=learn-wren \
  pnpm tools:promote-to-admin <your-registered-email>
```
Expected: the CLI confirms the role grant (the account must be registered + email-verified first — Step 2). Then sign out/in on the site and load `/admin`: the instructor-applications and user-directory surfaces render (AdminRoleGuard passes).

- [ ] **Step 3: Verify bucket CORS against production**

```bash
node tools/deploy/verify-gcs-cors.mjs learn-wren-video-output --origin https://learnwren.com
node tools/deploy/verify-gcs-cors.mjs learn-wren-materials --preflight-put --origin https://learnwren.com
node tools/deploy/verify-gcs-cors.mjs learn-wren-video-output --origin https://learn-wren.web.app
```
Expected: all PASS. Later (after a video exists), re-run with a real signed segment URL pasted from a playback manifest.

---

## Task 13: Phase C — Pub/Sub wiring + video verification (interactive)

- [ ] **Step 1: Run the Pub/Sub provisioning script**

Run: `PROJECT_ID=learn-wren REGION=us-central1 ENV_SUFFIX=prod tools/deploy/provision-pubsub.sh`
Expected: prints the push endpoint (`https://api-….run.app/api/internal/transcoder-events`) and the three env values.

- [ ] **Step 2: Update the audience and redeploy functions**

Set `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE` in the 1Password `prod` item to the printed push endpoint (byte-exact), then:

```bash
pnpm secrets:render:deploy
grep LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE .env.learn-wren   # confirm the real URL
pnpm deploy:preview
```

- [ ] **Step 3: Full video lifecycle verification**

On `https://learn-wren.web.app` as an instructor: upload a real video → wait for transcode (poll the lesson editor) → play it back. This works from web.app **only because** `LEARNWREN_PUBLIC_URL=https://learn-wren.web.app` right now — the API pins each GCS resumable-upload session to that origin, and bucket CORS does not override it (an upload attempted from any other origin CORS-fails at the first chunk PUT; that is expected behavior, not breakage). Then:

```bash
gcloud pubsub subscriptions pull learn-wren-transcoder-events-prod-deadletter-sub --limit=5
# Expected: zero messages (the guard accepted the push)
node tools/deploy/verify-gcs-cors.mjs '<signed-segment-url-from-devtools>' --origin https://learn-wren.web.app
```

---

## Task 14: Phase D — custom domain (interactive, user-driven)

- [ ] **Step 1: Pre-flight the Route 53 zone**

```bash
dig +short AAAA learnwren.com; dig +short AAAA www.learnwren.com   # Expected: empty — ANY AAAA blocks SSL
dig +short A learnwren.com; dig +short CNAME www.learnwren.com     # note/remove stale records pointing elsewhere
dig +short CAA learnwren.com                                        # if non-empty: must allow letsencrypt.org AND pki.goog
dig +short TXT learnwren.com                                        # note existing TXT set — Firebase's value merges INTO it
```

- [ ] **Step 2: Connect the apex (Firebase console wizard)**

Hosting → Add custom domain → `learnwren.com` → Quick Setup. In Route 53: add the ownership TXT value (into the existing apex TXT record set if one exists — one TXT set per name) and the console-provided A record at the apex, TTL 300. The TXT is permanent — never delete it.

- [ ] **Step 3: Connect www as a redirect**

Add custom domain → `www.learnwren.com` → check "redirect to learnwren.com" → add its console-provided A record in Route 53.

- [ ] **Step 4: Wait for SSL, then verify**

Cert provisioning: usually hours, up to 24 h (invalid-cert interstitial in the meantime is normal). Then:

```bash
curl -sI https://learnwren.com | head -3                    # HTTP/2 200
curl -sI https://www.learnwren.com | head -3                # 301 → https://learnwren.com
curl -s https://learnwren.com/api/health                    # 200, JSON containing "status":"ok"
```
Manual: full walkthrough on `https://learnwren.com` **including video playback** (page origin changed; CORS policies already allow it).

- [ ] **Step 5: Flip `LEARNWREN_PUBLIC_URL` to the custom domain and re-verify video upload**

Edit the 1Password `prod` item: `LEARNWREN_PUBLIC_URL` = `https://learnwren.com`. Then:

```bash
pnpm secrets:render:deploy
grep LEARNWREN_PUBLIC_URL .env.learn-wren    # confirm https://learnwren.com
pnpm deploy:preview
```

Verify on `https://learnwren.com`: upload one more video → transcode → playback. From now on video uploads only work from learnwren.com (the canonical origin) — uploads attempted from learn-wren.web.app CORS-fail by design, and email links now use the custom domain.

---

## Task 15: Phase E — email live (interactive, gated on SES approval)

- [ ] **Step 1: Confirm SES production access granted** (AWS console → SES → Account dashboard shows production, quota ≥ 50,000/day typical). Until then the site is live but only SES-verified recipients get email.

- [ ] **Step 2: End-to-end email verification**

On `https://learnwren.com`: register with a real mailbox → receive the verification email (check `DKIM=pass` / `dkim=pass header.d=learnwren.com` in the raw headers); complete a password-reset round trip; change password and receive the notice.

- [ ] **Step 3: Close out**

Update `docs/deployment.md`: the intro blockquote still implies no real deploy has happened — change it to state the app is live at `https://learnwren.com` (deployed per the spec's phases). Update "Production setup status" if anything diverged during execution, and record follow-ups (canonical-URL handling, dedicated runtime SA, CI auto-deploy, DMARC tightening) as deferred items — they are listed in the spec's Non-Goals. Commit the doc updates.
