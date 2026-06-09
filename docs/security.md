# Security Notes

Running record of the platform's security posture and the reasoning behind it,
so reviewers don't re-flag deliberate design decisions as gaps. Maps to
[EP-09 US-09-02 (Security)](./epics/09-non-functional-requirements.md).

## Session authentication

- Auth is **API-mediated**: the Firebase Auth client SDK is not in the web
  bundle. `POST /api/auth/login` verifies credentials via Firebase's REST API
  and the server mints a Firebase **session cookie**.
- The cookie is set with `HttpOnly; Secure; SameSite=Strict; Path=/`
  (`libs/api-auth/src/lib/session-cookie.helper.ts`).
- Logout revokes refresh tokens (bumps `validSince`), so the session cookie is
  rejected on the next verification regardless of its remaining TTL.

## Firestore security rules — which file deploys (SEC-1, 2026-06-09)

- **`firestore.rules` is the only file that deploys.** `firebase.json` references
  it, so `firebase deploy --only firestore:rules` and the default
  `firebase emulators:exec` both use it. It is deny-by-default; the API runs on
  the Admin SDK and bypasses rules, and the web app has no Firebase client SDK,
  so no legitimate path needs client read/write.
- **`firestore.emulator.rules` is dev-only and never deploys.** It is identical
  to `firestore.rules` except it adds a world-writable `match /_smoke/{docId}`
  block (a wire smoke test for the local Emulator UI). It is referenced **only**
  by `firebase.emulator.json`, which `pnpm emulators` selects via
  `--config firebase.emulator.json`.
- Previously `firebase.json` pointed at `firestore.emulator.rules`, so a deploy
  would have shipped the `_smoke` block as an unauthenticated public write sink
  (SEC-1). Fixed by splitting the configs. Static guards in
  `apps/api-e2e/src/firestore-rules.e2e-spec.ts` fail the build if `firebase.json`
  ever deploys an emulator-flavored rules file, if `firestore.rules` regains a
  `_smoke`/world-writable block, or if the two rules files diverge by anything
  other than that block.

## CSRF protection — audited 2026-05-30

**Status: protected. No CSRF-token middleware (`csurf`) is used or needed.**

State-changing requests are protected by `SameSite=Strict` on the `__session`
cookie. The browser never attaches the cookie to a request that originates from
another site, so a malicious page cannot forge an authenticated state-changing
request. This satisfies EP-09 US-09-02's "CSRF protection on all state-changing
requests." `csurf` is deprecated/unmaintained and would be redundant here.

Supporting controls (defense in depth):

- **CORS allowlist.** `app.enableCors({ origin: <allowlist>, credentials: true })`.
  In production the API **refuses to boot** if `LEARNWREN_CORS_ORIGINS` is unset
  (`apps/api/src/main.ts`) — no silent permissive fallback.
- **`helmet()`** sets standard security headers.
- **Body size cap** of 100 kb on JSON.
- **No GET endpoint mutates persistent state.** Every `@Get(...)` across the
  libs is a read (catalog, course/lesson views, publish-eligibility *preview*,
  video manifest/keys, enrollment status, profile reads, signed-URL minting).
  This is the precondition for `SameSite` to fully protect state changes, and it
  holds. Re-verify it when adding endpoints.

### Caveats to keep in mind (not defects)

1. **`SameSite=Strict` and external links into guarded pages.** A user arriving
   via an external link (e.g. a link in an email) to an *authenticated* route
   won't have the cookie sent on that first top-level GET, so they'd appear
   logged-out until a same-site navigation. Today's email landing pages
   (verify / unlock / reset / email-changed) are public and perform their own
   POST, so this is fine. Reconsider before adding an email link that targets a
   guarded route — `SameSite=Lax` would be the usual trade-off there.

2. **Session-cookie TTL vs the NFR.** The session cookie TTL is 5 days
   (`SESSION_COOKIE_MAX_AGE_SECONDS`), whereas US-09-02 specifies a 24-hour
   maximum. Logout revocation is in place (the more important property), but the
   TTL and the NFR should be reconciled — either tighten the cookie or amend the
   requirement.

## CORS posture — audited 2026-05-31

A "CORS error on the video player page" was reported and investigated. **It was not a cross-origin vulnerability or misconfiguration.** Findings:

- **The app's own API is same-origin.** The web app calls the API with relative `/api/...` URLs: in dev the Angular dev server proxies `/api` → `:3333` (`apps/web/proxy.conf.json`); in the planned deploy Firebase Hosting rewrites `/api` to the function. So auth, captions delivery (`/api/playback/captions/:vid`), and HLS manifests/keys are all same-origin — no CORS applies to them. The server-side CORS allowlist (`app.enableCors`, prod refuses to boot without `LEARNWREN_CORS_ORIGINS`) is defense-in-depth for any genuinely cross-origin XHR.
- **The reported error was a dev-only artifact.** In local **fake playback-storage mode** the player's HLS segment URLs are stubs (`gs-stub://…`). The browser blocks any request whose scheme isn't http/https/data/etc. and *phrases that scheme rejection as a "blocked by CORS policy" error*. It was hls.js failing to fetch fake segments — not a real cross-origin request. Fixed by skipping hls.js in fake mode and showing a dev placeholder (merge `947d074`); production is unaffected.
- **One genuine cross-origin path to validate at deploy (pre-existing, EP-03):** in production, HLS **video segments** are real `https://storage.googleapis.com` signed URLs (cross-origin), and the `<video crossorigin="use-credentials">` element + hls.js `xhr.withCredentials = true` send them as credentialed cross-origin fetches. That requires the GCS bucket's CORS config to allow the web origin **with credentials** (no `Access-Control-Allow-Origin: *`), and the credentials are functionally pointless there (the signed URL is what authorizes). This predates the captions/placeholder work; see the open item below.

## Open items (tracked, not yet done)

- A basic **OWASP Top 10** review before initial deployment (US-09-02).
- Reconcile the 24h session-token requirement (caveat 2 above).
- **Production HLS segment CORS:** decide whether to drop `withCredentials` on segment fetches (signed URLs don't need it) or to configure credentialed CORS on the output bucket, and verify real playback cross-origin before deploy (see CORS posture above).
