# Auth: Registration and Login Design Spec

> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

**Status:** Draft (2026-05-04)
**Scope:** Implement the foundational auth slice for the Learn Wren MVP — user registration (UC-01-01) and login (UC-01-02) — so that every subsequent epic has a verified identity to build on. Establish the Firestore rule helpers (`isAuthenticated`, `isOwner`, `isAdmin`, `hasRole`), the `users/{uid}` collection rule, and the session-cookie machinery on both the Angular client and the NestJS API.

This spec is the immediate sibling of the firebase-project-connection spec (`2026-04-30-firebase-project-connection-design.md`) — that one wired the apps to Firebase; this one wires *users* to the apps. It explicitly defers profile editing, email-verification gating, brute-force lockout, password reset, instructor-role requests, and admin promotion to follow-up specs.

## Goal

A fresh clone, after `pnpm install` and `pnpm secrets:render`, must satisfy:

- A new visitor can submit a registration form with a display name, email, and password meeting the 12-char/4-char-class policy and end up with a Firebase Auth user, a `users/{uid}` Firestore document, the `role: 'STUDENT'` custom claim set, and a verification email sent to their address. The same visitor can immediately log in.
- A registered user can submit the login form and receive a `__session` HttpOnly + Secure + SameSite=Strict cookie, with their UID and role visible to subsequent API calls via a `FirebaseSessionGuard`.
- The Angular `AuthService` exposes a `currentUser` signal that the `authGuard` can use to gate protected routes. `GET /auth/me` is the bootstrap probe that populates this signal on app load.
- `firestore.rules` (the production-safe file) carries the four rule helpers and a `/users/{userId}` rule that allows read on owner-or-admin and forbids client writes. `firestore.emulator.rules` carries the same helpers + the existing `_smoke` escape hatch.
- The custom claim (`role`) and the Firestore doc (`role` field) are written together at registration; rules check the claim, the API and UI read the doc.
- Logout clears the cookie and revokes refresh tokens so any leaked ID tokens stop working at the next `verifySessionCookie(..., true)` check.
- All prior-spec commands (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`, `pnpm start`, `pnpm emulators`, `pnpm secrets:render`, `pnpm secrets:run`, `GET /api/health`, `GET /api/firestore-smoke` against emulators) still pass with no regression.
- The first-ever deploy of `firestore.rules` to the real `learn-wren` project happens as part of this slice's verification.

That is the contract this spec delivers.

## Non-Goals

These each have, or will have, their own spec:

- **Email-verification gating.** The verification email *is* sent at registration, but login does not check `emailVerified`. UC-01-02 extension 4c (the gate) is deferred. Same for the "Resend Verification Email" UI affordance.
- **Brute-force lockout.** UC-01-02 extension 4b (3-strike, 15-minute lockout, unlock email) requires a counter store and a separate flow; it ships in its own spec.
- **Profile editing.** UC-01-03 (display name / picture / bio updates, email change with re-verification, password change). The `/users/{uid}` write rule is `if false` in this slice; profile-edit spec relaxes it to a whitelisted owner-update.
- **Instructor role request.** UC-01-04 ships separately. The custom-claim plumbing this spec lays down is the foundation, but the application form, queue, admin review, and approval flow are out of scope.
- **Admin promotion.** No console or CLI for promoting a user to `ADMIN`. The first admin will be promoted manually via Admin SDK script when needed (out of this slice's plan).
- **Password reset.** Not in any UC-01-NN main success scenario; arrives with profile editing or its own spec.
- **Suspended-account handling (UC-01-02 ext 4d).** Requires an admin UI to suspend; deferred to platform-administration scope.
- **Social auth providers.** Email + password only. Google/GitHub/etc. are not in any acceptance criterion in EP-01.
- **Custom email templates / branded sender.** Firebase's default verification email is used. Templating is deferred.
- **Public profile reads.** The `/users/{userId}` read rule in this slice is `isOwner(userId) || isAdmin()`. Public profile cards (e.g., "instructor card on a course detail page") will need a relaxation — likely a separate `public_profiles/{uid}` collection populated on the API path that exposes only safe fields, decided when the course-discovery spec lands.
- **Account deletion.** Post-MVP. `/users/{userId}` delete rule stays `if false`.
- **Cloud Functions packaging of `apps/api`.** The NestJS app keeps running as a plain Node server, same as the prior spec. Wrapping it in `firebase-functions onRequest()` is still its own future spec. Cookies must work in both modes; the `__session` cookie name is chosen to be Hosting-rewrite-compatible regardless.
- **Hosting deploys / SPA rewrites.** Same deferral as the prior spec.

## Decisions Made During Brainstorming

| Decision | Choice | Rationale |
| :--- | :--- | :--- |
| Slice scope | UC-01-01 + UC-01-02 only; defer UC-01-03 and UC-01-04 | EP-01 as a whole is too large for one spec. Register + login is the foundational primitive that every other epic depends on. |
| Auth topology | Hybrid: API-mediated registration, client-SDK login, server-mediated session-cookie exchange | Honors the use case's HttpOnly-cookie requirement, keeps Firebase Auth as the source of truth for credentials (free email verification, password reset later), uses the officially documented `createSessionCookie` pattern. |
| Role storage | Firebase Auth custom claim (`role`) + `users/{uid}` Firestore doc field. Rules read the claim; API/UI read the doc. | Rule-eval cost matters (claims are free; `get()` reads in rules are billed and slow). Role changes are rare in this product, so the dual-write cost is negligible. |
| Email verification | Send the email at registration via Firebase, do not gate login on `emailVerified` | Costs almost nothing now; field is correctly populated from day one so the future gate spec only adds enforcement. |
| User doc + claim provisioning | Synchronous via `POST /auth/register`, with `auth.deleteUser()` rollback on partial failure | Avoids the "zombie Auth user with no Firestore doc" failure mode of an async `auth.user().onCreate` trigger. Keeps registration logic in NestJS instead of a separate Cloud Function. |
| Password complexity enforcement | Server-side at the API in addition to Angular form validators | Defense in depth. Lets us layer in banned-word lists / breach-corpus checks later without depending on Firebase Auth's project-level Password Policy. |
| Session cookie name | `__session` (hard requirement, not a preference) | The only cookie name Firebase Hosting will forward to a Cloud Function. Future Hosting-rewrite spec will require this name; choosing it now avoids a rename. |
| Session cookie duration | 5 days | Firebase default. Re-issued on each `/auth/session` call. |
| CSRF protection | `SameSite=Strict` only; no separate CSRF token | API and web app are same-origin in prod; state-changing endpoints require JSON content-type. Re-evaluate if a third-party origin ever consumes the API. |
| Cross-origin in dev | Angular dev-server proxy `apps/web/proxy.conf.json` forwards `/api/**` to the Functions emulator | Keeps cookies first-party in dev with zero CORS surface. One config file, no `cors` middleware. |
| Web auth code location | New `libs/web-auth` (Angular standalone components, signals, functional guard, interceptor) | Auth is a stable cross-cutting concern; isolating it as a lib matches the existing `libs/api-firebase` and `libs/shared-data-models` pattern and keeps `apps/web` thin. |
| API auth code location | New `libs/api-auth` (NestJS module, controller, services, guard, DTOs) | Symmetric to `libs/web-auth`. The module imports `FirebaseAdminModule` transitively via its existing global registration. |
| `users` doc ID | Equal to the Firebase Auth UID | Eliminates a lookup index, makes `isOwner` rules trivial, matches how Firebase ecosystems standardly map identity to Firestore. |
| Error envelope | `{ error: { code: 'STRING_CODE', message: 'human readable', details?: {...} } }` | HTTP status is the primary signal; `code` exists so the client can switch on a stable identifier without scraping prose. Single `AuthExceptionFilter` enforces the shape on `AuthController`. |
| Logout side effects | Always clear cookie (idempotent); revoke refresh tokens on a valid logout | Defense against leaked ID tokens. `verifySessionCookie(..., /* checkRevoked */ true)` is the read-side check that makes revocation effective. |
| New devDependency | `@firebase/rules-unit-testing` (for the Firestore rules test) | Single new dep, scoped to the rules test only. The rest of the test stack is unchanged. |

## 1. Architecture and Topology

### 1.1 Registration flow

1. Angular `RegisterPage` collects `{ email, password, displayName }` and posts to `POST /auth/register`.
2. NestJS `AuthController.register` invokes `AuthService.register`:
   - `PasswordPolicyService.validate(password)` — synchronous, pure, returns `{ valid: true }` or `{ valid: false, unmet: PolicyRequirement[] }`. On invalid, throw 400 `WEAK_PASSWORD` with `details.unmetRequirements`.
   - Trim and validate `displayName` (1..80 chars after trim, throw 400 `INVALID_DISPLAY_NAME` if empty/oversized).
   - `auth.createUser({ email, password, displayName })`. On `auth/email-already-exists`, throw 409 `EMAIL_ALREADY_EXISTS` (the controller-side mapping returns the precise code; the Angular component is responsible for the enumeration-resistant prose, see §3.5).
   - On success, run the rest in sequence:
     a. `firestore.collection('users').doc(uid).set({ id: uid, email, displayName, role: 'STUDENT', createdAt, updatedAt })`.
     b. `auth.setCustomUserClaims(uid, { role: 'STUDENT' })`.
     c. `auth.generateEmailVerificationLink(email)` — the link itself is sent by Firebase.
   - If (a) or (b) fails, call `auth.deleteUser(uid)` (best-effort) and throw 500 `INTERNAL`. The rollback prevents a zombie Auth user with no Firestore doc and/or no claim.
   - If (c) fails, log a warning and continue. The user has a working account; failing registration over a transient SMTP hiccup would punish them needlessly. The response indicates the email was not sent so the UI can offer a "resend" affordance later.
3. Response: `201 { uid, email, emailVerificationSent: <boolean> }` — `true` when (c) succeeded, `false` when (c) failed.
4. Angular `AuthService.register` immediately calls `signInWithEmailAndPassword(firebaseAuth, email, password)` to get a fresh ID token, then proceeds to the session-cookie exchange (§1.3).

### 1.2 Login flow

1. Angular `LoginPage` collects `{ email, password }` and `AuthService.login` calls `signInWithEmailAndPassword(firebaseAuth, email, password)` directly via the Firebase Auth client SDK.
   - On `auth/user-not-found` or `auth/wrong-password`, the component shows the generic prose "Invalid email or password" (UC-01-02 ext 4a). The error code is logged client-side at `console.warn` only.
   - The 3-strike lockout (UC-01-02 ext 4b) is deferred. The form does not increment any counter in this slice.
2. The client now holds an ID token. Continue to the session-cookie exchange (§1.3).

### 1.3 Session-cookie exchange

1. Client calls `currentUser.getIdToken(true)` (force-refresh) to ensure the ID token contains the `role` custom claim. (At first registration, the original `signInWithEmailAndPassword` token predates the claim being set; force-refreshing pulls the new claim. At login, the freshly-minted token already has the claim — force-refresh is harmless.)
2. Client `POST /auth/session` with body `{ idToken }` and `withCredentials: true`.
3. NestJS `AuthController.session`:
   - `auth.verifyIdToken(idToken, /* checkRevoked */ true)` — on failure, 401 `INVALID_ID_TOKEN`.
   - `auth.createSessionCookie(idToken, { expiresIn: 5 * 24 * 60 * 60 * 1000 })` — on `auth/argument-error` or "ID token has been revoked", 401 `INVALID_ID_TOKEN`. On `auth/id-token-expired` or "recent sign-in required" (Firebase requires the ID token to have been minted within the last 5 min for `createSessionCookie` to accept it), 401 `RECENT_SIGN_IN_REQUIRED` so the client knows to re-sign-in and retry.
   - Set cookie via `SessionCookieHelper.toSetCookie(value, { maxAgeSeconds })` (§3.4).
4. Response: `200 { uid, role }` plus `Set-Cookie: __session=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=432000`.
5. Angular `AuthService.refresh()` (called by both `register()` and `login()` after the session call) hits `GET /auth/me` and stores the result in the `currentUser` signal.

### 1.4 Authenticated request flow

1. Any Angular HTTP request to `/api/**` automatically includes the `__session` cookie because the global `withCredentialsInterceptor` sets `withCredentials: true`.
2. NestJS routes guarded by `FirebaseSessionGuard`:
   - Read `__session` from `request.cookies` (`cookie-parser` middleware, registered in `apps/api/src/main.ts`).
   - On missing or empty cookie → 401 `UNAUTHENTICATED`.
   - `auth.verifySessionCookie(cookie, /* checkRevoked */ true)`. On any failure (expired, malformed, revoked), 401 `UNAUTHENTICATED`.
   - On success, attach `{ uid, email, role, emailVerified }` to `request.user` and continue.

### 1.5 Logout flow

1. Angular `AuthService.logout()` calls `POST /auth/logout`, then `signOut(firebaseAuth)`, then `currentUser.set(null)`.
2. NestJS `AuthController.logout`:
   - Read `__session` from `request.cookies`. If present, attempt `auth.verifySessionCookie(cookie, /* checkRevoked */ true)`; on success use the decoded `uid` to call `auth.revokeRefreshTokens(uid)`. Verification failure here is silently ignored — the cookie still gets cleared.
   - Always set the response cookie to `__session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0` (browsers treat `Max-Age=0` as immediate deletion).
   - Always return 204. Endpoint is idempotent — calling it without a cookie still succeeds.

## 2. Data Model and Firestore Rules

### 2.1 `users/{userId}` document

Matches the existing `User` interface in `libs/shared-data-models`:

| Field | Type | Source | Notes |
| :--- | :--- | :--- | :--- |
| `id` | `UserId` (branded) | API at registration | Equals the document ID. Equals the Firebase Auth UID. |
| `email` | `string` | API at registration | Mirror of Firebase Auth email. Read-mostly; updated only when email-change ships in profile-edit spec. |
| `displayName` | `string` | API at registration | Trimmed; 1..80 chars. |
| `role` | `'STUDENT' \| 'INSTRUCTOR' \| 'ADMIN'` | API at registration (always `'STUDENT'`) | Mirror of the custom claim. |
| `createdAt` | `ISODateString` | API at registration | `new Date().toISOString()` cast to the brand. |
| `updatedAt` | `ISODateString` | API at registration | Same as `createdAt` initially. |

The doc ID is the Firebase Auth UID. No separate `uid` field — `id` is the canonical reference.

### 2.2 Firebase Auth custom claim

```
{ role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN' }
```

Set by the API at registration (§1.1). Mirrored to the `users/{uid}` `role` field. Source of truth for security-rule decisions; `users/{uid}.role` is the source of truth for UI/API display.

When the role changes (instructor approval, admin promotion — both deferred), the writer must update the claim *and* the doc atomically (Firestore transaction for the doc; `setCustomUserClaims` is a separate Admin SDK call but is idempotent). The future spec that introduces those changes will codify the order.

### 2.3 Rule helpers

Added to *both* `firestore.rules` (production-safe) and `firestore.emulator.rules` (with `_smoke` retained):

```
function isAuthenticated() {
  return request.auth != null;
}

function isOwner(userId) {
  return isAuthenticated() && request.auth.uid == userId;
}

function hasRole(role) {
  return isAuthenticated() && request.auth.token.role == role;
}

function isAdmin() {
  return hasRole('ADMIN');
}
```

### 2.4 `/users/{userId}` rule

```
match /users/{userId} {
  allow read:   if isOwner(userId) || isAdmin();
  allow create: if false;   // API only (Admin SDK bypasses rules).
  allow update: if false;   // Profile-edit spec relaxes this.
  allow delete: if false;   // Account deletion is post-MVP.
}
```

The `_smoke/{docId}` rule in `firestore.emulator.rules` is preserved unchanged. Everything outside `/users/**` and `/_smoke/**` (in emulator-mode) remains deny-by-default via the existing catch-all match.

### 2.5 Rules deploy

`firestore.rules` is deployed to the real `learn-wren` project as part of this slice's verification (`firebase --project production deploy --only firestore:rules`). This is the first-ever rules deploy for the project; the prior spec only confirmed the file the deploy *will* use was sane.

## 3. NestJS API

### 3.1 Layout

```
libs/api-auth/src/
  index.ts                                 // re-exports AuthModule and the guard
  lib/
    auth.module.ts                         // exports AuthController, FirebaseSessionGuard
    auth.controller.ts                     // /auth/register, /auth/session, /auth/logout, /auth/me
    auth.service.ts                        // orchestrates Admin SDK + Firestore writes
    password-policy.service.ts             // pure validate(password)
    firebase-session.guard.ts              // reads __session, verifies, attaches request.user
    session-cookie.helper.ts               // builds Set-Cookie header (single source of truth)
    auth.exception-filter.ts               // serializes AuthException to {error:{code,message,details?}}
    dto/
      register.dto.ts                      // class-validator decorators
      session.dto.ts                       // { idToken: string }
    errors/
      auth-error.codes.ts                  // string-literal union of all codes
      auth.exception.ts                    // base AuthException + factory helpers
    types/
      authenticated-request.ts             // Express Request augmented with .user
```

`AuthModule` is wired into `apps/api/src/app/app.module.ts` alongside the existing `FirebaseAdminModule.forRoot()`. The `AuthExceptionFilter` is registered on `AuthController` only via `@UseFilters` — it does not affect the existing smoke endpoints.

### 3.2 `PasswordPolicyService`

```ts
type PolicyRequirement = 'MIN_LENGTH' | 'UPPERCASE' | 'LOWERCASE' | 'DIGIT' | 'SPECIAL';

class PasswordPolicyService {
  validate(password: string): { valid: true } | { valid: false; unmet: PolicyRequirement[] };
}
```

- `MIN_LENGTH` — fewer than 12 chars.
- `UPPERCASE` — no `[A-Z]`.
- `LOWERCASE` — no `[a-z]`.
- `DIGIT` — no `[0-9]`.
- `SPECIAL` — no character matching `/[^A-Za-z0-9]/`.

Pure synchronous function. No external dependencies. The Angular form validator is a parallel implementation of the same rules — see §4.4 for the duplication note.

### 3.3 `AuthService`

Consumes `FIREBASE_AUTH` and `FIRESTORE` tokens from the existing `FirebaseAdminModule`. No new injection tokens.

```ts
class AuthService {
  async register(input: RegisterDto): Promise<{ uid: UserId; email: string; emailVerificationSent: true }>;
  async createSessionCookie(idToken: string): Promise<{ cookie: string; uid: UserId; role: UserRole; maxAgeSeconds: number }>;
  async logoutSideEffects(sessionCookie: string | undefined): Promise<void>;  // revokes refresh tokens if cookie is valid
  async getMe(uid: UserId): Promise<MeResponse>;  // reads users/{uid}, throws if missing
}
```

Failure-mode contract for `register()`:

| Stage | Failure | Side effect | Returned error |
| :--- | :--- | :--- | :--- |
| Password validation | unmet requirements | none | 400 `WEAK_PASSWORD` |
| Display-name validation | empty/oversized | none | 400 `INVALID_DISPLAY_NAME` |
| Email validation | malformed | none | 400 `INVALID_EMAIL` |
| `auth.createUser` | `auth/email-already-exists` | none | 409 `EMAIL_ALREADY_EXISTS` |
| `auth.createUser` | other | none | 500 `INTERNAL` |
| `firestore.set` (post-create) | any | `auth.deleteUser(uid)` (best-effort) | 500 `INTERNAL` |
| `auth.setCustomUserClaims` | any | `auth.deleteUser(uid)` (best-effort) | 500 `INTERNAL` |
| `auth.generateEmailVerificationLink` | any | log warning, do **not** roll back | 201 with `emailVerificationSent: false` |

The verification-email failure is non-blocking on purpose: the user has a working account and can request a resend in a future spec; failing registration over an unsent email would punish the user for an SMTP hiccup.

### 3.4 `SessionCookieHelper`

Single source of truth for the cookie's `Set-Cookie` header. Generates:

```
__session=<value>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=<seconds>
```

For logout, `<value>` is empty and `<seconds>` is `0`. Tests assert the exact flag set.

The `Secure` attribute is unconditional. Local emulator development goes through the Angular dev-server proxy (§3.7); the proxy preserves `Secure` cookies in dev because Chromium treats `localhost` and `127.0.0.1` as secure contexts. This is verified during plan execution.

### 3.5 `AuthController`

```ts
@Controller('auth')
@UseFilters(AuthExceptionFilter)
class AuthController {
  @Post('register')   register(@Body() dto: RegisterDto): Promise<RegisterResponse>;
  @Post('session')    session(@Body() dto: SessionDto, @Res({ passthrough: true }) res): Promise<SessionResponse>;
  @Post('logout')     logout(@Req() req, @Res({ passthrough: true }) res): Promise<void>;
  @Get('me') @UseGuards(FirebaseSessionGuard)
                      me(@Req() req: AuthenticatedRequest): Promise<MeResponse>;
}
```

`@UseGuards(FirebaseSessionGuard)` is on `me` only. `register`, `session`, and `logout` are public — they create or destroy the session.

The controller never sees the password except for `register`; it never sees the ID token except for `session`. The cookie is read by the guard for `me`, and inspected by the controller in `logout`.

### 3.6 `FirebaseSessionGuard`

```ts
@Injectable()
class FirebaseSessionGuard implements CanActivate {
  constructor(@Inject(FIREBASE_AUTH) private readonly auth: admin.auth.Auth) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookie = req.cookies?.['__session'];
    if (!cookie) throw new UnauthenticatedException();
    try {
      const decoded = await this.auth.verifySessionCookie(cookie, true);
      req.user = {
        uid: decoded.uid as UserId,
        email: decoded.email,
        role: decoded.role as UserRole,
        emailVerified: decoded.email_verified,
      };
      return true;
    } catch {
      throw new UnauthenticatedException();
    }
  }
}
```

The guard is exported from `libs/api-auth` so other modules can `@UseGuards(FirebaseSessionGuard)` on their controllers.

### 3.7 Cookie parsing and dev proxy

- `apps/api/src/main.ts` adds `app.use(cookieParser())` before the Nest router. `cookie-parser` is added as a runtime dependency.
- `apps/web/proxy.conf.json` (new) forwards `/api/**` to `http://127.0.0.1:5001/.../api` (the Functions emulator) and is wired into `apps/web/project.json`'s `serve` target via `proxyConfig`. The emulator path component is the project ID + region (e.g., `demo-learnwren/us-central1/api`); we'll resolve the exact form during plan execution since `apps/api` is not yet a Cloud Function — for this slice, it runs as a plain Node server on `http://127.0.0.1:3000`, and the proxy points there. When the api-as-Cloud-Function spec lands, the proxy target updates to the emulator URL.

### 3.8 Error envelope

```ts
type AuthErrorCode =
  | 'INVALID_EMAIL'
  | 'WEAK_PASSWORD'
  | 'INVALID_DISPLAY_NAME'
  | 'EMAIL_ALREADY_EXISTS'
  | 'INVALID_ID_TOKEN'
  | 'RECENT_SIGN_IN_REQUIRED'
  | 'UNAUTHENTICATED'
  | 'INTERNAL';

interface AuthErrorBody {
  error: {
    code: AuthErrorCode;
    message: string;
    details?: { unmetRequirements?: PolicyRequirement[] };
  };
}
```

`AuthExceptionFilter` catches `AuthException` instances and serializes them. Anything else thrown from the controller becomes 500 `INTERNAL` with a generic message.

### 3.9 Logging

- Registration success: `[auth] register uid=<uid>`.
- Registration failure: `[auth] register failed code=<code>`. No email, no password, no display name in logs.
- Session-mint success: `[auth] session uid=<uid>`.
- Session-mint failure: `[auth] session failed code=<code>`.
- Logout: `[auth] logout uid=<uid|none>`.
- Guard rejection: `[auth] guard rejected reason=<missing|invalid|revoked>` (no UID — we don't have one if the cookie failed verification).

Standard Nest `Logger`. No external logging service in this slice.

## 4. Angular Client

### 4.1 Layout

```
libs/web-auth/src/
  index.ts                                 // re-exports AuthService, authGuard, components
  lib/
    auth.service.ts                        // signal-based currentUser, register/login/logout/refresh
    auth.guard.ts                          // functional CanActivateFn
    with-credentials.interceptor.ts        // adds withCredentials: true to every HttpRequest
    password-policy.validator.ts           // mirrors PasswordPolicyService rules as Angular validators
    register-page/
      register-page.component.ts
      register-page.component.html
      register-page.component.spec.ts
    login-page/
      login-page.component.ts
      login-page.component.html
      login-page.component.spec.ts
    types/
      authenticated-user.ts                // AuthenticatedUser interface (uid/email/displayName/role/emailVerified)
      api-error.ts                          // mirror of AuthErrorBody
```

The library is consumed from `apps/web` via the path-mapped import `@learnwren/web-auth`. The pages are lazy-loaded; the service and interceptor are eagerly provided in `app.config.ts`.

### 4.2 `AuthService`

```ts
@Injectable({ providedIn: 'root' })
class AuthService {
  private firebaseAuth = inject(Auth);
  private http = inject(HttpClient);

  // undefined = not yet checked; null = anonymous; AuthenticatedUser = signed in
  readonly currentUser = signal<AuthenticatedUser | null | undefined>(undefined);
  readonly isAuthenticated = computed(() => !!this.currentUser());

  async register(input: { email: string; password: string; displayName: string }): Promise<void>;
  async login(input: { email: string; password: string }): Promise<void>;
  async logout(): Promise<void>;
  async refresh(): Promise<void>;  // GET /auth/me, populates currentUser, sets to null on 401
}
```

`register()`:
1. POST `/auth/register` with the form values.
2. On 201, `signInWithEmailAndPassword(this.firebaseAuth, email, password)`.
3. `currentUser.getIdToken(true)` (force-refresh).
4. POST `/auth/session` with `{ idToken }`.
5. `await this.refresh()`.

`login()` is steps 2–5.

`logout()`:
1. POST `/auth/logout`.
2. `signOut(this.firebaseAuth)`.
3. `this.currentUser.set(null)`.

`refresh()`:
1. GET `/auth/me`.
2. On 200, `this.currentUser.set(response)`.
3. On 401, `this.currentUser.set(null)`.
4. On any other error, leave the signal as-is and re-throw.

### 4.3 `authGuard`

```ts
export const authGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.currentUser() === undefined) {
    await auth.refresh();
  }
  if (auth.currentUser() === null) {
    return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
  }
  return true;
};
```

Used on every protected route. `AppShell` triggers `auth.refresh()` once on bootstrap so the first guarded navigation doesn't pay the round-trip latency twice.

### 4.4 Password-policy validator (Angular)

A function that returns an Angular `ValidatorFn`, encoding the same rules as `PasswordPolicyService`. The rules are duplicated by design: client and server have different module systems, and shipping the server's TS to the browser is overkill for a five-rule pure function. The duplication is verified by a parallel test that runs the same fixture set against both implementations and asserts identical `unmet` arrays — see §6.

### 4.5 `withCredentialsInterceptor`

```ts
export const withCredentialsInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req.clone({ withCredentials: true }));
};
```

Registered globally in `apps/web/src/app/app.config.ts` via `provideHttpClient(withInterceptors([withCredentialsInterceptor]))`.

### 4.6 Routing

`apps/web/src/app/app.routes.ts` adds:

```ts
{
  path: 'login',
  loadComponent: () => import('@learnwren/web-auth').then((m) => m.LoginPageComponent),
},
{
  path: 'register',
  loadComponent: () => import('@learnwren/web-auth').then((m) => m.RegisterPageComponent),
},
```

A placeholder protected route demonstrates the guard:

```ts
{
  path: 'dashboard',
  canActivate: [authGuard],
  loadComponent: () => import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
},
```

`DashboardComponent` is a stub — a single `<h1>` greeting `currentUser().displayName` and a logout button. It exists to give the guard something to gate and to exercise the full flow during manual verification.

### 4.7 Components

Both pages are standalone, use `ReactiveFormsModule`, and consume `AuthService` directly. Both display API error codes via a small switch:

| `error.code` | Displayed text |
| :--- | :--- |
| `WEAK_PASSWORD` | List the unmet requirements ("at least 12 characters", "at least one uppercase letter", etc.) |
| `INVALID_EMAIL` | "Please enter a valid email address." |
| `INVALID_DISPLAY_NAME` | "Display name is required and must be 80 characters or fewer." |
| `EMAIL_ALREADY_EXISTS` | **"Unable to complete registration. Please check your details."** (enumeration-resistant — UC-01-01 ext 3a). |
| Firebase Auth `auth/wrong-password` or `auth/user-not-found` (login only) | "Invalid email or password." (UC-01-02 ext 4a). |
| `RECENT_SIGN_IN_REQUIRED` | "Your sign-in expired. Please try again." (and the form auto-retries the session-cookie exchange after re-signing-in once; if that also fails, surface the message). |
| Anything else | "Something went wrong. Please try again." |

The dev-only `firestore-smoke.component` stays in place. It is not modified by this spec.

## 5. Configuration and Environment

No new `LEARNWREN_*` environment variables are introduced. The existing wiring from the firebase-project-connection spec (`LEARNWREN_FIREBASE_TARGET=production` flips both apps to the real project) covers everything this spec needs.

`apps/web/proxy.conf.json` is checked into git — it carries no secrets, only emulator hostnames.

Cookie `Secure` is on unconditionally; the dev workflow relies on Chromium treating `localhost` as a secure context. Verified during plan execution.

## 6. Testing

### 6.1 Unit tests (Vitest)

`libs/api-auth`:

- `password-policy.service.spec.ts` — table-driven over the five `PolicyRequirement` values plus boundary lengths 11 and 12 plus the all-valid case. Pure function, no fixtures. ~12 cases.
- `auth.service.spec.ts` — mocks `FIREBASE_AUTH` and `FIRESTORE`. Cases:
  - register happy path: assert call ordering `createUser → set → setCustomUserClaims → generateEmailVerificationLink`.
  - register weak password: rejects before any SDK call.
  - register `auth/email-already-exists`: 409, no `deleteUser` called.
  - register Firestore-write fails after Auth user created: asserts `auth.deleteUser(uid)` rollback, returns 500.
  - register `setCustomUserClaims` fails: same rollback, returns 500.
  - register `generateEmailVerificationLink` fails: NO rollback, returns 201 with `emailVerificationSent: false`.
  - createSessionCookie happy path.
  - createSessionCookie with stale ID token: returns `RECENT_SIGN_IN_REQUIRED`.
  - logoutSideEffects with valid cookie: calls `revokeRefreshTokens`.
  - logoutSideEffects with missing/invalid cookie: no-op, no throw.
- `firebase-session.guard.spec.ts` — missing cookie 401; invalid cookie 401; revoked cookie 401; valid cookie populates `request.user`.
- `auth.controller.spec.ts` — thin: each route delegates correctly; `/session` and `/logout` responses include the expected `Set-Cookie` flags (assert string matches `__session=`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Max-Age=432000` or `Max-Age=0`).
- `auth.exception-filter.spec.ts` — error envelope shape.

`libs/web-auth`:

- `auth.service.spec.ts` — uses `HttpTestingController`. Cases:
  - `register()` posts to `/auth/register`, then signs in, then posts to `/auth/session`, then GETs `/auth/me` — assert order via flush sequencing.
  - `login()` sequence (skips `/auth/register`).
  - `logout()` clears signal even on API failure.
  - `refresh()` populates from `/auth/me` 200; sets to `null` on 401; re-throws on 500.
  - `EMAIL_ALREADY_EXISTS` is propagated as a structured error the component can switch on.
- `auth.guard.spec.ts` — `undefined` signal awaits `refresh()`; anonymous redirects with `?redirect=`; authenticated allows.
- `with-credentials.interceptor.spec.ts` — adds `withCredentials: true` to outgoing requests.
- `password-policy.validator.spec.ts` — same fixture set as the server's `password-policy.service.spec.ts`; assert identical `unmet` arrays. This is the parallel-implementation guard.
- `register-page.component.spec.ts` / `login-page.component.spec.ts` — happy submit, password-policy inline errors (register only), `EMAIL_ALREADY_EXISTS` shows the generic prose, login `auth/wrong-password` shows the generic "Invalid email or password" prose.

### 6.2 Integration tests against the emulator suite

`apps/api-e2e/src/auth.e2e-spec.ts` (new) — boots the API via the existing `api-e2e` setup, exercises end-to-end against the running emulator suite:

1. `POST /auth/register` with valid input → 201; assert Auth emulator has the user, Firestore emulator has `users/{uid}` with `role: 'STUDENT'`, custom claim is set (verified via `auth.getUser(uid).then(u => u.customClaims)`).
2. `POST /auth/register` with same email → 409 `EMAIL_ALREADY_EXISTS`.
3. Sign in via REST against the Auth emulator (the emulator exposes a REST API for testing) to obtain an ID token; force-refresh to pull the claim.
4. `POST /auth/session` with the ID token → 200 + `Set-Cookie: __session=...`.
5. `GET /auth/me` with the cookie → 200 with `{ uid, email, displayName, role, emailVerified }`.
6. `POST /auth/logout` → 204; subsequent `GET /auth/me` with the now-cleared cookie → 401.

`apps/api-e2e/src/firestore-rules.e2e-spec.ts` (new) — uses `@firebase/rules-unit-testing` against the emulator. Cases:

1. Anonymous client cannot read `/users/{anyUid}`.
2. Authenticated client (uid=A) can read `/users/A` but not `/users/B`.
3. Authenticated client cannot create, update, or delete `/users/{anyUid}`.
4. Admin client (custom claim `role: 'ADMIN'` via `initializeTestEnvironment`) can read any `/users/{uid}`.

(The "Admin SDK bypasses rules" case is verified by the auth-e2e test step 1 in §6.2 above, since `@firebase/rules-unit-testing` only simulates the client SDK by design.)

Adds `@firebase/rules-unit-testing` as a devDependency. Scoped to this test file; not imported elsewhere.

### 6.3 Manual verification checklist

Executed during plan execution and recorded in the post-impl summary:

1. **Emulator-mode happy path:** register a new user via the UI, verify the Auth emulator UI shows the user, Firestore emulator UI shows the doc with `role: 'STUDENT'`, the verification email appears in the emulator inbox, login works, dashboard renders, `GET /auth/me` round-trips, logout clears the cookie and bounces back to `/login`.
2. **Emulator-mode rules:** from a logged-in session, attempt to read `/users/{otherUid}` via a temporary devtools snippet. Denied. Read own — allowed. Confirms `isOwner` rule is wired.
3. **Emulator-mode errors:** weak password shows the right inline errors; duplicate email registration shows the generic enumeration-resistant prose; wrong-password login shows "Invalid email or password."
4. **Production-mode happy path:** same flow against the real `learn-wren` project. The verification email actually lands. Cleanup: delete the test user from the Auth console + the Firestore doc.
5. **Production rules deploy:** `firebase --project production deploy --only firestore:rules`. First-ever deploy. Confirm the rules viewer in the console shows the deployed version.
6. **Bundle audit:** `dist/apps/web/browser/` contains no plaintext password and no auth-secret strings. Sanity check.

## 7. Risks and Open Questions

- **Same-origin assumption.** The CSRF posture (`SameSite=Strict` only, no token) depends on the API and web app being same-origin in production. Once the api-as-Cloud-Function spec lands and the Hosting rewrite is in place, this is true. Until then, the plan-mode dev workflow uses the dev-server proxy to keep cookies first-party. If the API is ever exposed at a separate origin (e.g., a public API at `api.learn-wren.com`), the CSRF design must be revisited.
- **Force-refresh timing.** Step 3 of §1.3 requires the client to call `getIdToken(true)`. If the user's clock is severely skewed (>5 min), `verifyIdToken` may reject the token as too old or too new. We rely on browser clock accuracy; if this becomes a problem, add `auth.useDeviceLanguage()` followed by an `idTokenChanged` listener on the client. Not in scope.
- **Verification-link sender.** Firebase's default verification email comes from `noreply@<project>.firebaseapp.com`. Branded sender (`noreply@learn-wren.com`) requires SMTP config in the Firebase console. Out of scope; flagged for the email-templating spec.
- **Custom-claim staleness.** Custom claims are baked into the ID token at issuance. After `setCustomUserClaims`, existing tokens stay stale until the next refresh (up to 1 hour). For *registration* and *role changes* that immediately follow a session-mint, the force-refresh in §1.3 handles it. For *out-of-band* role changes (e.g., admin promotes user-X while user-X is logged in), the next role-aware request from user-X may see the stale claim until the ID token rotates. The instructor-approval spec will need to handle this — likely by force-refreshing on the affected user's next request, or by short-circuiting via a Firestore-doc check on critical paths.
- **`__session` name collision.** The cookie name `__session` is special-cased by Firebase Hosting. We do not use it for any other purpose. If a future spec needs another cookie, it must be a non-prefixed name and will not survive the Hosting rewrite path; that spec must address the implication.
- **Dev-server proxy target.** For this slice the proxy points at `http://127.0.0.1:3000` (the plain Node server `nx serve api` already runs). When the api-as-Cloud-Function spec lands, the target shifts to the Functions emulator URL (`http://127.0.0.1:5001/<projectId>/<region>/api`) and `apps/web/proxy.conf.json` is updated then. No work in this slice depends on the future form.

## 8. Follow-ups Explicitly Not in Scope

- **UC-01-02 ext 4b — 3-strike lockout, 15-min lockout, unlock email.** Requires a counter store (Firestore subcollection or memory) and a separate flow.
- **UC-01-02 ext 4c — email-verification gating.** Block login on `!emailVerified`; offer "Resend Verification Email." Builds on the `emailVerified` field this spec causes Firebase to populate.
- **UC-01-02 ext 4d — suspended-account blocking.** Requires admin-side suspend action.
- **UC-01-03 — profile editing.** Display name / picture / bio / email change / password change. The `/users/{uid}` write rule is `if false` in this slice; profile-edit spec relaxes it to a whitelisted owner-update.
- **UC-01-04 — instructor role request.** Application form, queue, admin review, approval flow with claim + doc update.
- **Admin promotion tooling.** A CLI script or admin UI to set `role: 'ADMIN'`.
- **Public profile reads.** Likely a separate `public_profiles/{uid}` collection populated by the API on user create / display-name change, with a public read rule.
- **App Check.** Adds a token Firebase Auth and Firestore can require on each call to prove the request comes from your app. Worth a spec once registration spam becomes a real signal.
- **Password reset.** UC-01-03 territory.
- **Custom email templates / branded sender.**
- **Analytics on auth events.**
