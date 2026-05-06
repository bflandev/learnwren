# Auth Hardening: Verification Gate, Lockout, Password Reset Design Spec

> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

**Status:** Draft (2026-05-06)
**Scope:** Implement the three login-hardening features deferred from the auth slice (`2026-05-04-auth-registration-and-login-design.md`): the email-verification gate (UC-01-02 ext 4c), brute-force lockout (UC-01-02 ext 4b), and the logged-out password-reset flow. Refactor login and the post-registration auto-login to be API-mediated so the NestJS server is the single chokepoint for all login policy. Remove the Firebase Auth client SDK from the web bundle.

This spec sits directly on top of the auth slice. It does not change the registration data model, the session-cookie format, the `users/{uid}` document, the rule helpers, or the existing logout flow. It changes how login *gets* to those things and adds a new collection (`auth_attempts/{emailHash}`) plus four new endpoints.

## Goal

A fresh clone, after `pnpm install` and `pnpm secrets:render`, must satisfy:

- A registered user with `emailVerified === true` can submit the login form, receive a `__session` cookie, and land on their dashboard. Same flow as the auth slice, but the credential check happens server-side and the `firebase/auth` web SDK is no longer in the bundle.
- A registered user with `emailVerified === false` who submits the login form gets a `403 EMAIL_NOT_VERIFIED` response, **no** session cookie, and a UI inline error with a "Resend verification email" button that calls `POST /auth/resend-verification` and renders confirmation prose.
- A user who submits three consecutive wrong passwords for the same email gets locked out: the 3rd response is `423 ACCOUNT_LOCKED`, an `auth_attempts/{emailHash}` doc is created with `lockedUntil = now + 15min`, an unlock email is sent containing a single-use unlock link, and any further `/auth/login` call for that email returns `423` until the lock clears. The lock clears via either the unlock-link click (`POST /auth/unlock`) or auto-expiry, whichever first.
- A user who clicks "Forgot password?" on the login page lands on `/forgot-password`, submits their email, and receives Firebase's templated password-reset email. The link in that email goes to Firebase's hosted action page; on completion the user is redirected to `/login`. The reset flow does **not** clear an active lockout.
- The `auth_attempts` collection is unreadable and unwritable by any client (rule `if false`); server access is via the Firebase Admin SDK only. The new rule has a `@firebase/rules-unit-testing` test asserting denial.
- The pre-deploy migration script (`tools/migrate-auth-2026-05-cleanup-unverified.ts`) is run once against the dev/test Firebase project to delete unverified accounts created during the auth slice's manual smoke testing. After this, the verification gate is unconditional.
- All prior-spec commands (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`, `pnpm start`, `pnpm emulators`, `pnpm secrets:render`, `pnpm secrets:run`) still pass with no regression.
- The previously-flaky `apps/api-e2e` happy-path test (`register → me → logout`) becomes deterministic: the `/auth/session` round-trip is gone, register is a single sequential server-side operation, the `users/{uid}` race that triggered the flake no longer exists.

That is the contract this spec delivers.

## Non-Goals

These each have, or will have, their own spec:

- **Logged-in password change.** UC-01-03 ext 3c (current password + new password while authenticated). The `/auth/request-password-reset` endpoint here is the logged-out recovery flow only. The logged-in change ships with the profile-edit spec.
- **Email change with re-verification.** UC-01-03 ext 3b. Profile-edit spec.
- **Suspended-account handling.** UC-01-02 ext 4d. Requires admin UI; deferred to platform-administration scope.
- **Custom action-page handler.** Verification-link clicks and password-reset-link clicks both land on Firebase's hosted `__/auth/action` page. Replacing it with a branded Angular `/auth/action` route, plus custom email templates, is a future UX-polish spec.
- **Per-IP rate limiting / credential-stuffing defense.** Lockout is per-email only. Cross-email brute-force from a single IP is bounded by Firebase Auth REST API's own rate limits; a dedicated infrastructure spec can layer in tighter controls later.
- **Firestore TTL on `auth_attempts` docs.** Lazy auto-expiry on read is sufficient for correctness. Adding a TTL policy for orphan cleanup is a follow-up.
- **Cloud Functions packaging of `apps/api`.** Same deferral as the prior spec.
- **Hosting deploys / SPA rewrites.** Same deferral as the prior spec.
- **Branded transactional email templates.** Verification and password-reset emails use Firebase's defaults. The unlock email uses whatever transport we pick in §3.7 with plain-text content; templating is deferred.
- **Live unlock countdown timer in the UI.** Static "Try again at HH:MM" rendering is enough; a live-updating countdown is a nice-to-have, not a requirement.

## Decisions Made During Brainstorming

| Decision | Choice | Rationale |
| :--- | :--- | :--- |
| Slice scope | Verification gate + lockout + password reset, all three together, including the API-mediated-login refactor | The features share email infrastructure and policy chokepoints. The refactor has no user value on its own and is required by lockout, so bundling avoids touching e2e tests twice. |
| Login topology | API-mediated. Server uses Firebase Auth REST API (`identitytoolkit.signInWithPassword`) to verify credentials, then mints the session cookie in the same response. Replaces today's client-side `signInWithEmailAndPassword` + `/auth/session` round-trip. | Lockout requires the failure point to be observable server-side. API-mediated login is the only architecture where the server is in the loop on *failed* attempts. As a side benefit, removes `firebase/auth` (~80 KB gzipped) from the web bundle and eliminates the post-register flake. |
| Verification gate strictness | Strict gate. `/auth/login` returns `403 EMAIL_NOT_VERIFIED` for unverified accounts. No grace period. No grandfathering of existing accounts. | The use case wording is unambiguous. Grace-period mode would require `emailVerified` checks scattered across every guarded endpoint — easy to miss one. No real users yet, so no grandfathering cost. |
| Lockout storage | Separate `auth_attempts/{emailHash}` collection (one doc per email, holding lockout state + throttle state) | Doesn't pollute `users/{uid}` (which the profile-edit spec will be writing to). Works whether or not the account exists. Email-hash doc IDs keep raw addresses out of accidental Firestore exports. |
| Lockout scope | Per-email only. No per-IP, no global rate limit. | Matches the use case verbatim. Per-IP is a separate threat model (credential stuffing) and belongs with infrastructure. |
| Lockout recovery | Auto-expiry at `lockedUntil` OR unlock-link click, whichever first. Unlock token is a single-use, one-per-lock random string. | Use case calls for both. Token is queried via Firestore single-field index on `unlockToken`. |
| Lockout interaction with verification gate | `EMAIL_NOT_VERIFIED` does not increment the failure counter. `INVALID_CREDENTIALS` does. `ACCOUNT_LOCKED` does not (already locked). | A user with the correct password isn't a brute-forcer; locking them out for being unverified is hostile. |
| Sliding window | None. Counter persists indefinitely until a clearing event (success, unlock, lazy expiry on next read after `lockedUntil`). | "Consecutive" interpreted strictly. If post-launch UX feedback is bad, add a 24h reset window in a follow-up. |
| Password reset infra | Firebase-managed. `auth.generatePasswordResetLink(email, { url: 'https://learnwren.com/login' })`. Firebase sends the email; the link lands on Firebase's hosted action page; the user is redirected to `/login` after success. | Zero Angular work for action-handling. Branded UX is a separate concern that pairs with custom email templates in a future spec. |
| Reset interaction with lockout | Reset does **not** clear the lockout. Independent flows. The login-error UI surfaces a hint when `?reset=ok` query param is present and login still returns `423`. | The Firebase-managed reset doesn't fire a server-side webhook on completion, so we can only act on the *request*, not the *success*. Clearing on request would let an attacker refresh the lockout every 60s and gain ~180 brute-force attempts/hour. The two-flow recovery (unlock email + reset email) is a small UX cost for a strictly cleaner security model. |
| `/auth/login` failure shape | `401 INVALID_CREDENTIALS` for "no such user" and "wrong password" (enumeration resistance). `403 EMAIL_NOT_VERIFIED` only after correct password. `423 ACCOUNT_LOCKED` is checked before credential verification. | Matches the use case's generic error message ("Invalid email or password") and prevents address enumeration via response variation or timing. |
| Throttle for resend / reset | 60-second per-email throttle on `lastResendVerificationAt` / `lastPasswordResetAt`. `429` otherwise. | Keeps spam bounded without a separate counter store. Lives on the same `auth_attempts/{emailHash}` doc. |
| Email transport for unlock email | Open question. Verification + reset emails are sent by Firebase (built-in). The unlock email is not a Firebase concept and needs its own send path. Options: third-party transactional sender (SendGrid, Mailgun) vs. SMTP via the Firebase project's mailer. | Decision parked for the implementation plan to avoid scoping creep here. See §3.7. |
| Web-side Firebase usage | Removed entirely. `apps/web` no longer depends on `firebase` or `firebase/auth`. | API-mediated login means the browser never needs an ID token, never calls Firebase Auth directly, and never holds Firebase config. |
| Web API key | `FIREBASE_WEB_API_KEY` env var on the server side. Public value (Firebase publishes it), but rendered through the existing `pnpm secrets:render` flow alongside other Firebase config for symmetry. | The REST call needs the Web API key as a query param. Not a secret, but treating it like one keeps config plumbing uniform. |
| Existing-user migration | Pre-deploy script `tools/migrate-auth-2026-05-cleanup-unverified.ts` deletes unverified Firebase Auth users and their `users/{uid}` docs. Idempotent. Run once against the dev/test project. | No real users yet. The dev/test accounts created during the auth slice are unverified and would otherwise be bounced by the gate forever. |

## 1. Architecture and Topology

### 1.1 API-mediated login flow

1. Angular `LoginPage` collects `{ email, password }` and calls `AuthService.login`, which posts to `POST /auth/login` with `withCredentials: true`.
2. NestJS `AuthController.login` invokes `AuthService.login`:
   a. Look up `auth_attempts/{emailHash}`. If `lockedUntil > now`, throw `423 ACCOUNT_LOCKED` with `details: { unlockAvailableAt: lockedUntil }`. (Lazy auto-expiry: if `lockedUntil <= now`, delete the doc and treat as fresh.)
   b. Call `FirebaseAuthRestClient.signInWithPassword({ email, password })`. On `EMAIL_NOT_FOUND` or `INVALID_PASSWORD`, increment the failure counter (§1.4) and throw `401 INVALID_CREDENTIALS`. On `USER_DISABLED`, also throw `401 INVALID_CREDENTIALS` (don't leak suspension state — that's UC-01-02 ext 4d, deferred). Other REST errors map to `500 INTERNAL`.
   c. The REST response includes the user record. If `emailVerified === false`, throw `403 EMAIL_NOT_VERIFIED` with `details: { resendAvailable: true }`. The failure counter is **not** touched.
   d. Use the `idToken` from the REST response to call `auth.createSessionCookie(idToken, { expiresIn: 5days })`.
   e. Set `Set-Cookie: __session=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=432000`.
   f. Delete the `auth_attempts/{emailHash}` doc (success clears counter and any throttle state).
   g. Look up `users/{uid}` to get `displayName`, `role`. Return `200 { uid, role, displayName, emailVerified: true }`.
3. Client `AuthService.login` updates the `currentUser` signal from the response. No second round-trip.

### 1.2 Auto-login during registration

The auth slice's two-step "register, then sign in" client-side dance becomes a single server-side sequence. `AuthService.register` (in `libs/api-auth`) extends to perform steps (a)–(f) of §1.1 internally on success, then sets the cookie and returns. The client `AuthService.register` no longer calls `signInWithEmailAndPassword` afterwards — the cookie is already set on the response. This eliminates the `users/{uid}` write/read race that has been making the existing `apps/api-e2e` happy-path test flaky.

### 1.3 Verification gate

Single check, single location: §1.1 step (c). The gate is on `/auth/login`. It is **not** on `/auth/register` (registration creates an unverified account by design) or `/auth/me` (the cookie is already proof of authentication; gating reads of self would lock unverified users out of the resend-verification UX).

### 1.4 Lockout subsystem

Detailed state machine and data model in §2.1–2.2. Summary:

- Counter increments on `INVALID_CREDENTIALS` (wrong email or wrong password).
- Counter is unaffected by `EMAIL_NOT_VERIFIED` and `ACCOUNT_LOCKED`.
- 3rd `INVALID_CREDENTIALS` transitions the doc from COUNTING → LOCKED (`lockedUntil = now + 15min`, `unlockToken = randomBase64Url(32)`). Unlock email is sent.
- Successful login deletes the doc.
- `POST /auth/unlock { token }` deletes the doc on a valid, non-expired token.
- Lazy auto-expiry: any read that finds `lockedUntil <= now` deletes the doc and treats the email as having no auth-attempts state.
- All counter mutations run inside `runTransaction` for safety against concurrent failures.

### 1.5 Password reset flow

1. User clicks "Forgot password?" on `/login` and lands on `/forgot-password`.
2. User submits email. Angular calls `POST /auth/request-password-reset { email }`.
3. NestJS `AuthService.requestPasswordReset`:
   a. Throttle: read `auth_attempts/{emailHash}.lastPasswordResetAt`. If less than 60 s ago, throw `429 TOO_MANY_REQUESTS`.
   b. Look up Firebase Auth user by email. If not found, return `202` silently (enumeration resistance).
   c. Call `auth.generatePasswordResetLink(email, { url: 'https://learnwren.com/login?reset=ok' })`. Firebase sends its templated email.
   d. Update `lastPasswordResetAt`. Return `202`.
4. User clicks the link. Firebase-hosted action page applies the reset.
5. User is redirected to `/login?reset=ok`. The login page reads the query param; if a subsequent login attempt returns `423 ACCOUNT_LOCKED`, the UI adds the just-reset hint (§4.4).

The reset flow does **not** mutate any field that could clear the lockout. See the Decisions table for rationale.

### 1.6 Logout

Unchanged from the auth slice. Cookie cleared, refresh tokens revoked. The web client no longer needs to call `signOut(firebaseAuth)` because there is no client-side Firebase Auth state to sign out of.

## 2. Data Model and Firestore Rules

### 2.1 `auth_attempts/{emailHash}` document

**Doc ID** is `sha256(email.trim().toLowerCase())` rendered as 64-character hex. Hashing keeps raw email addresses out of doc IDs (defense-in-depth against Firestore exports). It is not a cryptographic protection against targeted lookups — given a known email, the hash is computable. A future spec can swap to HMAC with a server-side secret if the threat model evolves.

**Logical shape:**

```ts
type AuthAttemptsDoc = {
  failedCount: number;                           // 0..3
  firstFailureAt: ISO8601 | null;                // first failure of current run
  lockedUntil: ISO8601 | null;                   // null when not locked
  unlockToken: string | null;                    // base64url(crypto.randomBytes(32)) when locked
  lastResendVerificationAt: ISO8601 | null;      // throttle (§1.5/§3.4)
  lastPasswordResetAt: ISO8601 | null;           // throttle (§1.5/§3.4)
  updatedAt: ISO8601;
};
```

All timestamp fields are stored as Firestore `Timestamp` and serialized to ISO 8601 strings on the wire per `2026-04-29-initial-nx-monorepo-design.md` §4.

**Indexes.** Single-field index on `unlockToken` (Firestore creates this automatically) so `POST /auth/unlock` can locate the doc by token alone, without needing the email.

### 2.2 Lazy auto-expiry

There is no scheduled job. Every server-side read of `auth_attempts/{emailHash}` checks `lockedUntil`:

- If `lockedUntil` is null → return doc as-is.
- If `lockedUntil > now` → return doc as-is (still locked).
- If `lockedUntil <= now` → delete the doc and return null (treat as fresh).

This collapses the LOCKED → FRESH transition into the same path as "doc never existed," so the rest of the auth logic doesn't have to think about expired-but-still-present docs.

### 2.3 Firestore rules

`firestore.rules` and `firestore.emulator.rules` both add:

```
match /auth_attempts/{emailHash} {
  allow read, write: if false;
}
```

Server-only access via Admin SDK (which bypasses rules). The `_smoke` escape hatch in the emulator rules is unaffected — it's scoped to its own collection.

### 2.4 `users/{userId}` rule

Unchanged from the auth slice (`isOwner(userId) || isAdmin()` for read; `if false` for write). The lockout doesn't touch the user doc.

## 3. NestJS API

### 3.1 Layout — additions to `libs/api-auth`

```
libs/api-auth/
  src/lib/
    auth.module.ts                               # extended: provides new services
    auth.controller.ts                           # /auth/login, /auth/logout, /auth/me, /auth/register,
                                                 #   /auth/resend-verification, /auth/request-password-reset, /auth/unlock
                                                 # /auth/session is REMOVED
    auth.service.ts                              # extended: login, requestPasswordReset, resendVerification, unlock
    auth-attempts.repository.ts                  # NEW: encapsulates auth_attempts/{emailHash} access; owns email-hashing and unlock-token generation
    firebase-auth-rest-client.ts                 # NEW: thin wrapper over identitytoolkit.signInWithPassword
    email-transport/
      email-transport.ts                         # NEW: interface — sendUnlockEmail(email, token, lockedUntil)
      email-transport.<provider>.ts              # NEW: concrete impl chosen at planning time (§3.7)
    firebase-session.guard.ts                    # unchanged
    session-cookie.helper.ts                     # unchanged
    password-policy.service.ts                   # unchanged
    auth-exception.filter.ts                     # extended: maps EmailNotVerified, AccountLocked, etc.
    dto/
      register.dto.ts                            # unchanged
      login.dto.ts                               # NEW: { email, password }
      session.dto.ts                             # REMOVED
      resend-verification.dto.ts                 # NEW: { email }
      request-password-reset.dto.ts              # NEW: { email }
      unlock.dto.ts                              # NEW: { token }
```

### 3.2 `AuthAttemptsRepository`

Single ownership over `auth_attempts/{emailHash}`. All other services go through this class — nothing else reads or writes the collection.

```ts
class AuthAttemptsRepository {
  emailHash(email: string): string;                  // sha256 of normalized email
  read(emailHash: string): Promise<AuthAttemptsDoc | null>;
                                                     // applies lazy auto-expiry; returns null on FRESH
  recordFailure(emailHash: string): Promise<{ locked: boolean; unlockToken?: string; lockedUntil?: Date }>;
                                                     // transactional increment; returns lock transition info
  clear(emailHash: string): Promise<void>;           // delete doc (success / unlock / future cleanup)
  redeemUnlockToken(token: string): Promise<{ status: 'ok' } | { status: 'expired' } | { status: 'invalid' }>;
                                                     // queries by indexed unlockToken field
  recordResendVerification(emailHash: string): Promise<{ throttled: boolean }>;
  recordPasswordResetRequest(emailHash: string): Promise<{ throttled: boolean }>;
}
```

`recordFailure` is the transactional core. Pseudocode:

```ts
async recordFailure(emailHash) {
  return runTransaction(async (t) => {
    const doc = await t.get(ref(emailHash));
    let data = doc.exists ? doc.data() : { failedCount: 0, firstFailureAt: null, lockedUntil: null, ... };

    if (data.lockedUntil && data.lockedUntil <= now) data = { failedCount: 0, ... };  // lazy expiry inside txn

    data.failedCount += 1;
    data.firstFailureAt ??= now;
    data.updatedAt = now;

    if (data.failedCount >= 3) {
      data.lockedUntil = now + 15min;
      data.unlockToken = base64url(randomBytes(32));
      t.set(ref(emailHash), data);
      return { locked: true, unlockToken: data.unlockToken, lockedUntil: data.lockedUntil };
    }

    t.set(ref(emailHash), data);
    return { locked: false };
  });
}
```

### 3.3 `FirebaseAuthRestClient`

Thin wrapper around `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<WEB_API_KEY>`. Returns `{ idToken, refreshToken, localId, email, registered }` on success. Maps Google's error codes to our domain:

- `EMAIL_NOT_FOUND` → `InvalidCredentialsException` (401)
- `INVALID_PASSWORD` → `InvalidCredentialsException` (401)
- `USER_DISABLED` → `InvalidCredentialsException` (401) (deliberate: don't leak suspension)
- Anything else → `InternalAuthException` (500), logged with the upstream code

The Web API key comes from `FIREBASE_WEB_API_KEY` env var, injected via the existing `firebase.config.ts` provider.

### 3.4 `AuthService` updates

New / changed methods:

```ts
async login(email, password): Promise<{ uid, role, displayName, emailVerified }>;
async resendVerification(email): Promise<void>;       // silent return on most paths
async requestPasswordReset(email): Promise<void>;     // silent return on most paths
async unlock(token): Promise<void>;                   // throws 400/410 on bad token
```

`register(...)` is extended to call the same internal "mint cookie from idToken" path that `login` uses, so registration auto-login no longer needs a client round-trip.

`logoutSideEffects(...)` is unchanged.

### 3.5 `AuthController` updates

```ts
@Post('login')                login(@Body() dto: LoginDto, @Res({ passthrough: true }) res): Promise<LoginResponse>;
@Post('resend-verification')  resendVerification(@Body() dto: ResendVerificationDto): Promise<void>;
@Post('request-password-reset') requestPasswordReset(@Body() dto: RequestPasswordResetDto): Promise<void>;
@Post('unlock')               unlock(@Body() dto: UnlockDto): Promise<void>;
```

`session()` is removed. `register()`, `logout()`, `me()` are unchanged at the controller level (`register()`'s service-side body changes per §3.4).

`@HttpCode(202)` on `resendVerification` and `requestPasswordReset` (always-202 success). `@HttpCode(204)` on `unlock`. `@HttpCode(200)` on `login` (matches existing pattern from auth slice fix `4eed593`).

### 3.6 Error envelope additions

The existing `AuthExceptionFilter` is extended with these mappings:

| Exception | HTTP | Code | Details |
|---|---|---|---|
| `InvalidCredentialsException` | 401 | `INVALID_CREDENTIALS` | — |
| `EmailNotVerifiedException` | 403 | `EMAIL_NOT_VERIFIED` | `{ resendAvailable: true }` |
| `AccountLockedException` | 423 | `ACCOUNT_LOCKED` | `{ unlockAvailableAt: ISO8601 }` |
| `TooManyRequestsException` | 429 | `TOO_MANY_REQUESTS` | — |
| `InvalidUnlockTokenException` | 400 | `INVALID_UNLOCK_TOKEN` | — |
| `UnlockTokenExpiredException` | 410 | `UNLOCK_TOKEN_EXPIRED` | `{ canRequestPasswordReset: true }` |

### 3.7 Email transport (open question)

The unlock email is the only one this slice sends that Firebase doesn't handle. The verification email is Firebase-templated, the password-reset email is Firebase-templated; the unlock email is not a Firebase concept.

Two candidate transports, **decision parked for the implementation plan**:

- **(a) Third-party transactional sender** (SendGrid / Mailgun / Resend / similar). Adds an SDK + API key. Most flexibility; brings a templating story.
- **(b) Direct SMTP via Nodemailer with the Firebase project's no-reply mailer credentials.** Simplest; reuses what's already configured.

The implementation plan picks one and resolves the API-key plumbing through the existing `secrets:render` mechanism. The interface (`EmailTransport.sendUnlockEmail`) is the same regardless, so the choice is contained to one concrete implementation file.

### 3.8 Logging

Existing patterns from the auth slice extended with:

- `[auth] login uid=<uid>` on success
- `[auth] login failed code=<code> emailHash=<hash>` on failure (no raw email in logs)
- `[auth] lockout fired emailHash=<hash> unlockToken=<masked>` when transitioning to LOCKED
- `[auth] unlock redeemed emailHash=<hash>`
- `[auth] resend-verification sent emailHash=<hash>` (only on actual send, not on silent-202 paths)
- `[auth] password-reset requested emailHash=<hash>` (only on actual send)

## 4. Angular Client

### 4.1 Layout — changes inside `libs/web-auth`

```
libs/web-auth/src/lib/
  auth.service.ts                                # heavily refactored (no Firebase SDK)
  login-page/login-page.component.ts             # extended: 3 new error states, "Forgot password?" link
  register-page/register-page.component.ts       # extended: "Resend" affordance on confirmation view
  forgot-password-page/                          # NEW
    forgot-password-page.component.ts
    forgot-password-page.component.html
  unlock-page/                                   # NEW
    unlock-page.component.ts
    unlock-page.component.html
  with-credentials.interceptor.ts                # unchanged
  auth.guard.ts                                  # unchanged
  password-policy.validator.ts                   # unchanged
  web-auth.routes.ts                             # adds /forgot-password and /auth/unlock
```

### 4.2 `AuthService` refactor

```ts
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser = signal<CurrentUser | null>(null);

  async login(email: string, password: string): Promise<LoginResult>;
  async register(email: string, password: string, displayName: string): Promise<RegisterResult>;
  async logout(): Promise<void>;
  async refresh(): Promise<void>;                              // bootstrap probe via GET /auth/me

  async resendVerification(email: string): Promise<void>;       // POST /auth/resend-verification
  async requestPasswordReset(email: string): Promise<void>;     // POST /auth/request-password-reset
  async unlock(token: string): Promise<UnlockResult>;           // POST /auth/unlock
}

type LoginResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_CREDENTIALS' | 'EMAIL_NOT_VERIFIED' | 'ACCOUNT_LOCKED'; details?: unknown };
```

Body changes:

- `login` no longer calls `signInWithEmailAndPassword`. It does `http.post('/api/auth/login', { email, password }, { withCredentials: true })`, parses the response, updates `currentUser` on success, returns the discriminated `LoginResult` on failure for the component to render.
- `register` no longer calls `signInWithEmailAndPassword` or `getIdToken(true)`. It posts to `/api/auth/register` and treats the response body identically to `login`'s success.
- `logout` no longer calls `signOut(firebaseAuth)`. It posts to `/api/auth/logout` and clears the signal.
- `refresh` is unchanged — `GET /api/auth/me` reads the cookie via the `withCredentialsInterceptor`.

### 4.3 Removal of Firebase web SDK

- `apps/web/package.json`: `firebase` and (transitively) `firebase/auth` removed from dependencies.
- `apps/web/src/app/app.config.ts`: any `provideFirebaseApp(...)`, `provideAuth(...)`, or equivalent provider deleted.
- `apps/web/src/environments/firebase.ts` (or wherever the client-side config lives): file deleted. The web app no longer needs the project's Web API key, project ID, or any other Firebase identifier.
- `apps/web-e2e`: any test setup that mocks Firebase or seeds Firebase Auth state via the client SDK is updated to seed via API calls instead.

### 4.4 `LoginPageComponent` updates

State machine for the form's error region:

| Error from `/auth/login` | Inline message | Affordances |
|---|---|---|
| `401 INVALID_CREDENTIALS` | "Invalid email or password." | (none beyond retry) |
| `403 EMAIL_NOT_VERIFIED` | "Please verify your email address before logging in." | "Resend verification email" button |
| `423 ACCOUNT_LOCKED` | "Your account is temporarily locked. Try again at HH:MM, or check your email to unlock now." | (none beyond retry) |
| `423 ACCOUNT_LOCKED` *and* URL has `?reset=ok` | Above message **plus** "If you've just reset your password, use the unlock link in your 'account locked' email or wait until HH:MM." | (none) |
| Network / 500 | "Something went wrong. Please try again." | (none) |

"Forgot password?" link is rendered unconditionally below the password input, routing to `/forgot-password`.

The `?reset=ok` query param is the signal that the user just completed a password reset (Firebase-hosted action page redirects to `https://learnwren.com/login?reset=ok` per §1.5). The component reads the param via `ActivatedRoute.queryParamMap`.

### 4.5 `ForgotPasswordPageComponent`

Single-field form (email). On submit, calls `authService.requestPasswordReset(email)` and immediately swaps to a confirmation view: "If an account exists for that address, we've sent reset instructions." No revealing of whether the address was found.

### 4.6 `UnlockPageComponent`

Reads `?token=...` from the URL on init. Immediately calls `authService.unlock(token)` and renders one of three terminal states:

- 204 → "Your account is unlocked. You can sign in now." with a button to `/login`.
- 410 (`UNLOCK_TOKEN_EXPIRED`) → "This unlock link has expired. You can reset your password to regain access." with a link to `/forgot-password`.
- 400 (`INVALID_UNLOCK_TOKEN`) → "This unlock link is invalid." with a link to `/login`.

No retry button. The token is single-use; if redemption failed, the user's path forward is reset, not retry.

### 4.7 `RegisterPageComponent` and the post-registration confirmation view

The post-registration "check your email" confirmation view (already present in the auth slice) gains a "Didn't get the email? Resend" button. On click:

1. Disable the button for 60 s (matches server throttle as a courtesy — server is the authority).
2. Call `authService.resendVerification(email)`. The email value is whatever the user submitted on the previous step.
3. Swap inline text to "Verification email sent. Check your inbox."

The same affordance is rendered on the login page in the `EMAIL_NOT_VERIFIED` error state (§4.4), with the email taken from the login form.

### 4.8 Routing

Additions to the existing route table:

```
/forgot-password         ForgotPasswordPageComponent
/auth/unlock             UnlockPageComponent
```

Both are public routes (no `authGuard`).

## 5. Configuration and Environment

### 5.1 `FIREBASE_WEB_API_KEY`

Server-side env var read by `FirebaseAuthRestClient`. Sourced from the Firebase project's web app config (visible in Firebase Console → Project Settings → Web Apps). Public value, but added to `.secrets/api.env` rendering for uniformity. Tooling (`pnpm secrets:render`) updated accordingly.

### 5.2 Firebase Console settings

- **Auth → Templates → Action URL**: leave default. Verification and password-reset emails continue to land on Firebase's hosted action page. The `continueUrl` we pass to `generatePasswordResetLink` and `generateEmailVerificationLink` controls the post-success redirect.
- **Auth → Settings → Authorized domains**: add `learnwren.com` (and any preview/staging hosts) so `continueUrl` redirects are accepted.

### 5.3 Email transport configuration

Whichever transport is chosen in §3.7, its credentials are added to `secrets:render` and consumed by the concrete `EmailTransport` implementation. Until the transport is chosen, the `email-transport.<provider>.ts` file is the single point of change.

## 6. Testing

### 6.1 Unit tests (Vitest)

**API side** (`libs/api-auth`):

- `AuthAttemptsRepository` — table-driven state-machine cases (FRESH → COUNTING, COUNTING → COUNTING, COUNTING → LOCKED, LOCKED on read with auto-expiry, LOCKED on read still-locked, LOCKED → FRESH via `clear`, throttle field roundtrip).
- `AuthService.login` — every error branch; verifies that `EMAIL_NOT_VERIFIED` and `ACCOUNT_LOCKED` do not call `recordFailure`; verifies that successful login calls `clear`.
- `AuthService.resendVerification` — silent-202 paths (user not found, user already verified), throttle path, success path.
- `AuthService.requestPasswordReset` — silent-202 paths, throttle path, success path; verifies that lockout state is **not** mutated.
- `AuthService.unlock` — valid token, expired token (deletes doc), invalid token.
- `FirebaseAuthRestClient` — fetch mocked; verifies request URL/body shape, error code mapping.
- `AuthExceptionFilter` — every new exception → correct status + envelope shape.

**Web side** (`libs/web-auth`):

- `AuthService` (Angular) with `HttpTestingController` — `login` happy/sad paths, `register`, `resendVerification`, `requestPasswordReset`, `unlock`. Verifies `currentUser` signal mutations.
- `LoginPageComponent` — renders correct affordances per error code; clicks "Resend" calls the right service method; `?reset=ok` query param triggers the just-reset hint.

### 6.2 API integration / e2e tests (`apps/api-e2e`, against the Firebase emulator suite)

- **Adapted happy-path** (replaces the flaky one): `register → me → logout`. Register no longer round-trips through `/auth/session`. Asserts the response from `register` already carries `Set-Cookie: __session=...`. Should be deterministic post-refactor.
- **Lockout flow**: register a user, manually flip `emailVerified = true` via Admin SDK, post 3 wrong passwords, assert the 3rd response is `423 ACCOUNT_LOCKED` with `unlockAvailableAt`, read the `auth_attempts/{emailHash}` doc to grab the `unlockToken`, post to `/auth/unlock`, assert `204` and that the doc is gone, log in successfully.
- **Verification gate**: register a user (default unverified), attempt login, assert `403 EMAIL_NOT_VERIFIED`. Manually flip `emailVerified = true`, log in, assert `200`.
- **Resend throttle**: post to `/auth/resend-verification` twice within 60 s, assert second response is `429`.
- **Password-reset request**: post to `/auth/request-password-reset`, assert `202` and the emulator received a `generatePasswordResetLink` invocation. (Don't try to verify email contents — the emulator's email simulation is shallow.)
- **Reset does NOT clear lockout**: induce lockout (3 fails), post password-reset request, attempt login, assert still `423 ACCOUNT_LOCKED`.
- **Enumeration resistance**: post `/auth/login`, `/auth/resend-verification`, `/auth/request-password-reset` for an email that doesn't exist; assert response shape is identical (in HTTP code and absence of details that leak existence) to a corresponding call for an unverified-but-extant email. Timing assertions are out of scope; structural assertions only.

### 6.3 Firestore rules tests (`apps/api-e2e/firestore-rules.e2e-spec.ts`)

Add to the existing `@firebase/rules-unit-testing` suite:

- Authenticated client cannot read `auth_attempts/{anyHash}`.
- Authenticated client cannot write `auth_attempts/{anyHash}`.
- Unauthenticated client cannot read or write `auth_attempts/{anyHash}`.

### 6.4 Manual verification checklist

Run against the local emulator suite before deploying:

1. Register a new account. Email verification email arrives at the local Auth emulator UI. Click the link in the emulator. Verify dashboard shows on next login.
2. Try to log in *before* verifying. Confirm `EMAIL_NOT_VERIFIED` error and "Resend" button work.
3. Submit 3 wrong passwords in a row. Confirm `423` error UI appears with a sensible local time. Confirm an unlock email exists at the chosen email transport's local debug surface.
4. Click the unlock link. Land on `/auth/unlock` page. See success copy. Log in successfully.
5. Trigger lockout again. Wait 15 minutes (or fast-forward `lockedUntil` in Firestore). Log in successfully without using the unlock link.
6. Click "Forgot password?" Submit email. Confirm the password-reset email arrives. Click the link; complete reset on Firebase's action page; confirm redirect to `/login?reset=ok`. Log in with new password.
7. Bonus path: trigger lockout, then immediately request password reset, then attempt login. Confirm `423` with the just-reset hint.

## 7. Migration

### 7.1 Pre-deploy cleanup

`tools/migrate-auth-2026-05-cleanup-unverified.ts`:

1. Use the Admin SDK to list all Firebase Auth users (paginated).
2. Filter to those with `emailVerified === false`.
3. Print the count and email addresses (truncated). Require an explicit `--confirm` flag to proceed.
4. For each: `auth.deleteUser(uid)`, then `firestore.collection('users').doc(uid).delete()`.
5. Idempotent. Safe to re-run.

Run once against the dev/test Firebase project before the slice is deployed. Production is empty so there is nothing to migrate.

## 8. Risks and Open Questions

- **Email transport.** Open. Choose in the implementation plan (§3.7). Decision affects one file plus a credentials line.
- **Lockout doc orphans.** Lazy auto-expiry handles correctness, but docs whose owners never come back will sit forever. Storage cost is trivial; a follow-up can add a Firestore TTL policy. Not a launch blocker.
- **Brute-force across many emails from one IP.** The per-email lockout doesn't protect against credential stuffing. Firebase Auth REST API has its own per-IP throttling; we depend on that for now. A future infra spec can layer in our own.
- **Just-reset UX awkwardness.** A user who resets their password and tries to log in while still locked sees `423` with a hint. The cleaner UX (reset clears lockout) was rejected for the security reason in §0 / Decisions table; we should monitor support volume after launch and revisit if it's a real problem.
- **Action handler is unbranded.** Verification + password-reset emails land on `firebaseapp.com`. Acceptable for an MVP, but conspicuous. Bundle the fix with custom email templates in a future UX-polish spec.

## 9. Follow-ups Explicitly Not in Scope

- UC-01-03 — profile editing, password change while logged in, email change with re-verification.
- UC-01-04 — instructor-role request flow.
- UC-01-02 ext 4d — suspended-account handling.
- Custom action handler at `/auth/action` — branded UX for verification + reset link clicks.
- Custom email templates — branded sender, branded HTML.
- Per-IP rate limiting and credential-stuffing defense.
- Firestore TTL policy on `auth_attempts`.
- Cloud Functions packaging of `apps/api`.
- Firebase Hosting deploys / SPA rewrites.
- Live unlock-countdown timer in the UI (vs. static "try again at HH:MM").
