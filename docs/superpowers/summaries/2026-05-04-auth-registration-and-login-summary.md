# Auth: Registration and Login — Implementation Summary

**Date:** 2026-05-04
**Spec:** `docs/superpowers/specs/2026-05-04-auth-registration-and-login-design.md`
**Plan:** `docs/superpowers/plans/2026-05-04-auth-registration-and-login.md`

Wires UC-01-01 (register) and UC-01-02 (login) end to end. A new visitor can register, get a Firebase Auth user, a `users/{uid}` Firestore doc with `role: 'STUDENT'`, a custom claim, and a verification email. Login mints a 5-day `__session` cookie (HttpOnly, Secure, SameSite=Strict). The Angular guard gates `/dashboard` on the cookie; the NestJS guard reads it and verifies via `verifySessionCookie(..., true)`. Logout revokes refresh tokens and clears the cookie.

## What shipped

### NestJS (`libs/api-auth`)

- `password-policy.service.ts` — pure synchronous validator returning `{valid: true} | {valid: false, unmet: PolicyRequirement[]}`. 12-char minimum + four character classes; preserves canonical requirement order.
- `session-cookie.helper.ts` — single source of truth for `Set-Cookie: __session=...`. Static `COOKIE_NAME = '__session'`. `toSetCookie` and `toClearingCookie` cover the mint and clear paths.
- `errors/auth-error.codes.ts` + `errors/auth.exception.ts` — string-literal `AuthErrorCode` union plus the eight named exception classes (Weak/InvalidEmail/InvalidDisplayName/EmailAlreadyExists/InvalidIdToken/RecentSignInRequired/Unauthenticated/InternalAuth).
- `auth.exception-filter.ts` — `@Catch()` filter serializing `AuthException` into `{error: {code, message, details?}}`. Falls through to 500 INTERNAL on unknown errors. Logs unknown errors but never logs `AuthException` messages (no PII leak).
- `auth.service.ts` — `register`, `createSessionCookie`, `logoutSideEffects`, `getMe`. Register orders: `auth.createUser` → `firestore.set` → `setCustomUserClaims` → `generateEmailVerificationLink`. Best-effort `auth.deleteUser` rollback if Firestore-set or set-claims fails. Verification-email failures are non-blocking (log warn + return `emailVerificationSent: false`).
- `firebase-session.guard.ts` + `types/authenticated-request.ts` — guard reads `__session` via `SessionCookieHelper.COOKIE_NAME`, calls `verifySessionCookie(cookie, true)` (checks revocation), populates `request.user = {uid, email, role, emailVerified}`.
- `dto/register.dto.ts` + `dto/session.dto.ts` — class-validator decorators (loose at the DTO level so the policy/displayName checks in `AuthService` can produce structured `unmet[]` payloads).
- `auth.controller.ts` — `POST /auth/register`, `POST /auth/session`, `POST /auth/logout` (idempotent, 204), `GET /auth/me` (guarded). The `Set-Cookie` header is built by the helper, never inline.
- `auth.module.ts` — exports `FirebaseSessionGuard` so other modules can `@UseGuards`.
- `apps/api/src/app/app.module.ts` — wires `AuthModule` and registers a global `ValidationPipe` with `{whitelist, forbidNonWhitelisted, transform}`.
- `apps/api/src/main.ts` — `app.use(cookieParser())` before the Nest router; `NestFactory.create<NestExpressApplication>(AppModule)`.
- `apps/api/tsconfig.app.json` — `esModuleInterop: true` (required by `cookie-parser`'s default-import shape).

### Angular (`libs/web-auth`)

- `password-policy.validator.ts` — Angular `ValidatorFn` mirroring the server policy; returns `{passwordPolicy: {unmet: PolicyRequirement[]}}` shaped errors.
- `with-credentials.interceptor.ts` — clones every outgoing request with `withCredentials: true` so the dev-server proxy passes the cookie.
- `auth.service.ts` — `@Injectable({providedIn: 'root'})` with a signal-based `currentUser` (`undefined | null | AuthenticatedUser`). `register`, `login`, `logout`, `refresh`. The implementation uses RxJS pipelines (`switchMap`) for the post-register / post-login flow rather than chained `await`s — see "Plan deviations" below.
- `auth.guard.ts` — functional `CanActivateFn`: triggers `auth.refresh()` when the signal is `undefined`; redirects to `/login?redirect=<url>` when `null`; allows when the signal carries a user.
- `login-page/` and `register-page/` — standalone components with reactive forms, signals for `busy` / `error`, error-code → prose mapping (enumeration-resistant prose for `EMAIL_ALREADY_EXISTS`, "Invalid email or password" for Firebase wrong-password, policy hint list for `WEAK_PASSWORD`).
- `types/authenticated-user.ts` + `types/api-error.ts` — wire shapes mirroring the API.
- `apps/web/src/app/dashboard/dashboard.component.ts` — protected route stub: greets the current user, signs out via `AuthService.logout()` then `window.location.assign('/login')`.
- `apps/web/src/app/app.routes.ts` — `/login`, `/register`, `/dashboard` (guarded), and `''` redirecting to `/login`.
- `apps/web/src/app/app.config.ts` — `provideHttpClient(withInterceptors([withCredentialsInterceptor]))` plus a `provideAppInitializer` that calls `auth.refresh()` once at boot.
- `apps/web/proxy.conf.json` + `apps/web/project.json` — dev-server proxy: `/api/**` → `http://127.0.0.1:3333`. Keeps cookies first-party in dev with no CORS surface.

### Rules

- `firestore.rules` (deploy-safe) and `firestore.emulator.rules` both gain the four helpers (`isAuthenticated`, `isOwner`, `hasRole`, `isAdmin`) and a `/users/{userId}` rule allowing read on owner-or-admin and forbidding all client writes (Admin SDK bypasses these). Emulator file retains the `_smoke/{docId}` allow-all block.

### Tests

- `libs/api-auth` — 39 vitest specs across 5 files: password-policy, session-cookie, exception-filter, auth.service (register + createSessionCookie + logoutSideEffects + getMe), firebase-session.guard, auth.controller.
- `libs/web-auth` — 22 vitest specs across 6 files: placeholder, password-policy.validator, with-credentials.interceptor, auth.service, auth.guard, login-page.component, register-page.component.
- `apps/api-e2e` — `firestore-rules.e2e-spec.ts` (5 cases via `@firebase/rules-unit-testing`) and `auth.e2e-spec.ts` (full register → session → me → logout round-trip + WEAK_PASSWORD path against the live emulator suite).

### Documentation

- `docs/development.md` — new "Auth dev workflow" section: endpoints, web routes, cookie, dev proxy, manual smoke flow, deferred items.
- `apps/web/src/app/dev/firestore-smoke.component.ts` — the `TODO(auth-spec)` comment was removed.

## Plan deviations worth knowing about

- **Web `AuthService` uses an RxJS pipeline (`switchMap`) for the post-register / post-login flow** instead of chained `await this.completeSession(...)`. The plan's exact-text `async/await` implementation produced a 3-microtask gap between `reg.flush()` and the `/api/auth/session` request being queued, which the plan's test (`await Promise.resolve()` × 2 between flushes) couldn't drain. Replacing `completeSession` with `sessionAndRefreshObservable` keeps the HTTP contract identical, sets the `currentUser` signal at the same point, and matches the test's microtask expectations.
- **Vite `server.deps.inline` adds `/rxfire/`** for `libs/web-auth`. Without it, `vi.mock('@angular/fire/auth', ...)` couldn't resolve `rxfire/auth` (an ESM/CJS interop issue surfaced only inside vitest).
- **`apps/api/tsconfig.app.json` enables `esModuleInterop: true`.** `import cookieParser from 'cookie-parser'` is a default import of a CJS module that lacks a native ESM default export, so TS rejects it without `esModuleInterop`. Standard NestJS posture.
- **`libs/web-auth/eslint.config.mjs` accepts `'app'` as a component-selector prefix** in addition to `'lib'`. The plan's selectors were `app-login-page` / `app-register-page`; widening the prefix list is more straightforward than renaming.
- **`libs/web-auth/tsconfig.lib.json` adds `composite: true`**, and `apps/web/tsconfig.spec.json` references `libs/web-auth/tsconfig.lib.json`. Without these, project-references compilation can't resolve cross-project source files when web's tests import the dashboard component (which imports `@learnwren/web-auth`).
- **`libs/api-auth/tsconfig.json` adds `composite: true`** to mirror `libs/api-firebase`, and `nx sync` added the `@learnwren/api-firebase` / `@learnwren/shared-data-models` project references when `auth.service.ts` first imported across libs.
- **The `RegisterPageComponent.WEAK_PASSWORD` test case uses a policy-passing client-side password** so `submit()` reaches the server (where the WEAK_PASSWORD response is mocked). The plan's `password: 'short'` would have been blocked client-side by `passwordPolicyValidator()` and never produced an `error()` for the test to assert on.
- **`libs/web-auth` uses `vitest-analog` instead of `vitest-angular`** because `vitest-angular` requires a buildable Angular library; the spec calls for "vitest as the unit-test runner" and `vitest-analog` is the vitest-flavor that fits non-buildable libs.
- **The plan's `LoginPageComponent` and `RegisterPageComponent` specs lacked an `ActivatedRoute` provider.** The standalone components import `RouterLink`, which injects `ActivatedRoute` at template-render time. Tests now provide a stub `ActivatedRoute` plus a `Router` mock with `createUrlTree` / `serializeUrl`.

## Verification outcome

- **Unit tests**: all green (`pnpm nx run-many -t test --parallel=1`). 61 specs across `libs/api-auth` (39), `libs/web-auth` (22), plus the prior `shared-data-models`, `api-firebase`, `api`, `web` suites.
- **Typecheck**: all green (`pnpm nx run-many -t typecheck`). 8 projects.
- **Lint**: all green (`pnpm nx run-many -t lint`). 3 prior warnings in `api-auth` and 5 in `web` are pre-existing and unrelated to this slice.
- **Production build**: `pnpm nx build web --configuration=production` succeeds. (Bundle initial exceeds the 500 KB budget by 144 KB; this is a known pre-auth situation tracked separately.)

### Manual / live operations not yet executed

The following steps from the plan's Task 25 are operations against the real `learn-wren` Firebase project. They are intentionally left for the human operator to run with appropriate credentials:

- `firebase --project production deploy --only firestore:rules` — first-ever rules deploy.
- Production-mode register / login / logout walkthrough at `http://localhost:4200` (against the real project), including cookie inspection in DevTools, verification-email receipt, Auth-console / Firestore-console checks, and post-verification cleanup of the test user.
- Production-bundle audit with `LEARNWREN_FIREBASE_TARGET=production` set during build (the unflagged build pulls in emulator strings via the generator's defaults — same situation as the prior firebase-project-connection slice).
- Live execution of `apps/api-e2e/src/{auth,firestore-rules}.e2e-spec.ts` against a running emulator suite (the specs are committed and typecheck cleanly; only the live `pnpm nx e2e api-e2e` run is deferred).

## Follow-ups not in scope

Per spec §8 and the corresponding "Non-Goals":

- **UC-01-02 ext 4b** — 3-strike lockout, 15-minute lockout window, unlock email.
- **UC-01-02 ext 4c** — email-verification gating on login.
- **UC-01-02 ext 4d** — suspended-account handling (depends on admin-side suspend action).
- **UC-01-03** — profile editing (display name / picture / bio / email change with re-verification / password change). The `/users/{uid}` write rule stays `if false` until that spec lands.
- **UC-01-04** — instructor role request (form, queue, admin review, approval flow).
- **Admin promotion tooling** — first admin will be set manually via Admin SDK script.
- **Public profile reads** — likely a separate `public_profiles/{uid}` collection populated on the API path; decided when course-discovery lands.
- **Account deletion**, **password reset**, **social auth providers**, **custom email templates / branded sender**, **App Check**, **analytics on auth events** — all explicitly deferred.
- **Cloud Functions packaging of `apps/api`** — the NestJS app still runs as a plain Node server. The `__session` cookie name is chosen now to be Hosting-rewrite-compatible when that spec arrives.
