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

## Open items (tracked, not yet done)

- A basic **OWASP Top 10** review before initial deployment (US-09-02).
- Reconcile the 24h session-token requirement (caveat 2 above).
