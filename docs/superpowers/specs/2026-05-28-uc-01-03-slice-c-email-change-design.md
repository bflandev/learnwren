> [!NOTE] DOCUMENT STATUS: DRAFT

# UC-01-03 Slice C — Change Email Address

**Use case:** [UC-01-03 — Manage User Profile](../../use-cases/01-user-identity-and-access.md#uc-01-03--manage-user-profile) (extension 3b)

**Date:** 2026-05-28

**Follows:** [UC-01-03 Slice A — Text Profile Editing](./2026-05-27-uc-01-03-slice-a-text-profile-design.md) (shipped 2026-05-28, `168994f`) and [UC-01-03 Slice B — Profile Picture](./2026-05-28-uc-01-03-slice-b-profile-picture-design.md) (shipped 2026-05-28, `1f8a284`).

## 1. Scope

This slice ships UC-01-03 **extension 3b**: an authenticated user changes their email address from `/settings/profile`, with the **new** address verified before the swap takes effect.

The flow:

1. The user enters a **new email** and their **current password**. The server re-authenticates with the current password, then asks Firebase to email a verify-and-change link to the **new** address.
2. The **current email stays fully active** — login, the existing session, and everything else are untouched — until the new address is verified.
3. Clicking the link routes through Firebase's hosted action handler, which swaps the email (`email = newEmail`, `emailVerified = true`) and redirects the user to an **unguarded** confirm page. The server finalizes (syncs the Firestore mirror, revokes refresh tokens, clears the session cookie) and the user is sent to `/login` to sign in with the **new** address.

Three product decisions, settled during brainstorming, shape this slice:

- **Security gate:** changing email **requires the current password** (re-authentication), consistent with the forthcoming Slice D password change and the account-takeover sensitivity of redirecting an account to a new inbox.
- **Verification mechanism:** **Firebase-native** — `auth.generateVerifyAndChangeEmailLink(...)` reserves the new address, emails the out-of-band code, and applies the swap when clicked. We do not maintain our own pending-email token store.
- **Post-change session:** **force re-login** — revoke refresh tokens at confirm and land the user on `/login`, which also resolves the stale-email-in-cookie problem.

### In scope

- New `email/` submodule under `libs/api-profile` (mirrors the `picture/` submodule layout): `EmailChangeController`, `EmailChangeService`, `email.exception-filter.ts`, `errors/email-change.exception.ts` + `errors/email-change-error.codes.ts`, `dto/change-email.dto.ts`.
- `POST /api/profile/email` (initiate) and `POST /api/profile/email/confirm` (finalize) endpoints, both guarded by `FirebaseSessionGuard`.
- New `EmailTransport.sendEmailChangeVerificationEmail({ to, verificationUrl })` method added to the interface and both implementations (`ConsoleEmailTransport`, `SmtpEmailTransport`); new outbox `kind: 'email-change'`; the `_test/last-email` endpoint's `kind` query union extended.
- `AuthModule` export widening: `EMAIL_TRANSPORT`, `FirebaseAuthRestClient`, `SessionCookieHelper` (plus the corresponding `api-auth` index re-exports needed for typing).
- Web: an inline, collapsed-by-default **"Change email"** section on the profile page; a new **unguarded** route `settings/profile/email-changed` → `EmailChangedComponent`; the login page reads `?emailChanged=1` to render a one-line success notice.
- Sync of the (non-authoritative) `users/{uid}.email` Firestore mirror on the happy confirm path.

### Out of scope (deferred — each tracked separately)

- **Slice D** — change password with current-password check and complexity reuse from `PasswordPolicyService` (UC-01-03 extensions 3c / 3c-3a / 3c-4a).
- Throttling the change-request endpoint (the current-password gate already blocks spam without the password). The `AuthAttemptsRepository` throttle pattern is the natural home if added later.
- A persistent "pending change to `new@x`" banner showing the target address — the Firebase-native mechanism never stores the pending email server-side, so we cannot render it. (A custom token store would have enabled it; rejected for the extra surface area.)
- Notifying the **old** address that a change was initiated.
- A **login-time reconcile** of the Firestore `email` mirror for the auto-revoke path (see §4.3). Non-blocking because no read path depends on that field.

## 2. Architecture

Following the Slice A/B precedent, **`libs/api-profile` owns the feature**, importing identity primitives from `api-auth`. The endpoints live under the existing `/api/profile` namespace.

### 2.1 `api-auth` export widening

`AuthModule` currently exports only `FirebaseSessionGuard` and `InstructorRoleGuard`. This slice adds three providers to its `exports` so `ProfileModule` (which already `imports: [AuthModule]`) can inject them:

| Export | Why api-profile needs it |
|--------|--------------------------|
| `EMAIL_TRANSPORT` | Reuse the **same** `ConsoleEmailTransport` singleton the `_test/last-email` outbox reads. A separate instance would make email-change mails invisible to api-e2e. |
| `FirebaseAuthRestClient` | Current-password re-authentication via `signInWithPassword`. |
| `SessionCookieHelper` | Emit the clearing `Set-Cookie` header on confirm. |

The corresponding symbol/interface/class are re-exported from `libs/api-auth/src/index.ts` for typing.

`FIREBASE_AUTH` is already a shared `api-firebase` provider, so api-profile injects it directly for `generateVerifyAndChangeEmailLink`, `getUser`, and `revokeRefreshTokens` — no new export required.

> **Note on `FirebaseAuthRestClient` reuse:** exporting it widens api-auth's surface with a capability that can sign in as any email/password. This is acceptable because the consumer is another first-party backend module within the same deployment, and it avoids duplicating the REST client + API-key plumbing. If a tighter seam is preferred during implementation, the alternative is a focused `verifyPassword(email, password)` method exported on a service rather than the raw client.

### 2.2 New email-transport surface (`api-auth`)

```ts
// libs/api-auth/src/lib/email-transport/email-transport.ts
export interface EmailChangeVerificationEmailInput {
  to: string;            // the NEW address
  verificationUrl: string;
}

export interface EmailTransport {
  sendUnlockEmail(input: UnlockEmailInput): Promise<void>;
  sendVerificationEmail(input: VerificationEmailInput): Promise<void>;
  sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void>;
  sendEmailChangeVerificationEmail(input: EmailChangeVerificationEmailInput): Promise<void>; // NEW
}
```

- `ConsoleEmailTransport`: implement the method and append an outbox entry with `kind: 'email-change'`. Extend `OutboxEntry['kind']` accordingly.
- `SmtpEmailTransport`: implement the method (subject/body mirroring the existing verification email).
- `AuthController._test/last-email`: extend the `kind` query union to `'unlock' | 'verification' | 'password-reset' | 'email-change'`.

### 2.3 `api-profile/email/` submodule

```
libs/api-profile/src/lib/email/
  email-change.controller.ts
  email-change.service.ts
  email.exception-filter.ts
  dto/change-email.dto.ts
  errors/email-change.exception.ts
  errors/email-change-error.codes.ts
```

Registered in `ProfileModule` alongside the existing controllers/providers. The controller carries `@UseFilters(EmailChangeExceptionFilter)` and `@UseGuards(FirebaseSessionGuard)` (per-feature exception filter convention, established by `VideoExceptionFilter` / `PictureExceptionFilter`).

The DTO carries **no `class-validator` length/format decorators** — type-shape only — so the global `ValidationPipe` cannot pre-empt the feature's typed error codes with a generic `BAD_REQUEST`. All validation lives in `EmailChangeService`. (Documented short-circuit lesson.)

## 3. Data model

No shared-data-model entity changes. New wire DTOs only:

```ts
// Request — POST /api/profile/email
interface ChangeEmailRequest {
  newEmail: string;
  currentPassword: string;
}

// Response — POST /api/profile/email/confirm
interface ConfirmEmailChangeResponse {
  changed: boolean;        // true when this call performed the swap finalization
  email?: string;          // present when changed === true
}
```

`POST /api/profile/email` returns `202 Accepted` with no body.

The Firestore `users/{uid}.email` field already exists (written at registration). It is **non-authoritative**: no read path consumes it for behavior — `login` reads only `displayName`/`role`; `getMe`/`getProfile` read email from the session cookie; the catalog instructor join reads `displayName`/`photoUrl`. We keep it in sync on the happy confirm path as hygiene.

## 4. Data flow

### 4.1 Initiate — `POST /api/profile/email`

`FirebaseSessionGuard`-protected. Body `{ newEmail, currentPassword }`. The controller passes `req.user.uid` and `req.user.email` (current address, from the cookie) into the service.

`EmailChangeService.requestChange(uid, currentEmail, { newEmail, currentPassword })`:

1. **Normalize + validate.** Trim and lowercase `newEmail`. Reject with `EMAIL_INVALID` if empty or failing `EMAIL_REGEX` (the same regex `AuthService` uses). If `newEmail === currentEmail` → `EMAIL_UNCHANGED`.
2. **Re-authenticate.** `restClient.signInWithPassword({ email: currentEmail, password: currentPassword })`. On `InvalidCredentialsException` → throw `CurrentPasswordInvalidException` (`CURRENT_PASSWORD_INVALID`). Signing in as the *current* email both proves the password and is a no-op on session state.
3. **Generate the verify-and-change link** — also the uniqueness gate:
   ```ts
   const link = await this.auth.generateVerifyAndChangeEmailLink(
     currentEmail,
     newEmail,
     { url: this.continueUrl('/settings/profile/email-changed') },
   );
   ```
   Firebase throws `auth/email-already-exists` if the new address belongs to another account → map to `EmailAlreadyInUseException` (`EMAIL_ALREADY_IN_USE`, HTTP 409). **Deliberate divergence** from registration's enumeration-resistant generic error: for an authenticated self-service email change, "that address is already in use" is the standard, expected behavior.
4. **Send.** `emailTransport.sendEmailChangeVerificationEmail({ to: newEmail, verificationUrl: link })`. Any link-generation or transport failure (other than the mapped codes) → `EmailChangeFailedException` (`EMAIL_CHANGE_FAILED`, HTTP 500) after logging.
5. **Respond `202 Accepted`.** Nothing has changed server-side; the old email, session, and login still work.

### 4.2 Confirm — `POST /api/profile/email/confirm`

The link lands on Firebase's hosted action handler, which applies the swap and redirects to `/settings/profile/email-changed`. That **unguarded** Angular page calls confirm on init. The endpoint itself *is* `FirebaseSessionGuard`-protected; the client tolerates a `401` (see §4.3).

`EmailChangeService.confirmChange(uid, cookieEmail)`:

1. `firebaseUser = await this.auth.getUser(uid)`.
2. **Detect the swap:** if `firebaseUser.email !== cookieEmail && firebaseUser.emailVerified === true` → finalize:
   - a. `firestore.collection('users').doc(uid).update({ email: firebaseUser.email, updatedAt: nowIso })`.
   - b. `await this.auth.revokeRefreshTokens(uid)` — idempotent; the force-logout teeth, since `FirebaseSessionGuard` verifies cookies with `checkRevoked = true`.
   - c. The controller emits the clearing `Set-Cookie` via `SessionCookieHelper.toClearingCookie()`.
   - d. Return `{ changed: true, email: firebaseUser.email }`.
3. **Else** (emails match — link not yet clicked, or already finalized) → `{ changed: false }`, an idempotent no-op.

Client behavior: on `changed: true` **or** a `401`, clear client auth state (`authSvc.setCurrentUser(null)`) and redirect to `/login?emailChanged=1`. On `changed: false`, route back to `/settings/profile`.

### 4.3 The auto-revoke wrinkle (why confirm must tolerate 401)

Firebase may revoke existing sessions the instant it applies the email change (a credential-level change that sets `tokensValidAfterTime`). If so, by the time the confirm page loads, the old session cookie is already invalid and the guard returns **401** before the service body runs. Therefore:

- The landing route is **unguarded.** An auth-guarded page would trigger `authGuard` → `auth.refresh()` (`/me`) → 401 → bounce to `/login` before confirm ever fires.
- The client treats a **`401`-on-confirm exactly like `changed: true`** — the change succeeded; just sign in again.

**Consequence:** in the auto-revoke path the Firestore mirror sync (step 2a) does not run. Because no read path depends on `users/{uid}.email` (see §3), a briefly-stale mirror is harmless; a login-time reconcile is a **deferred follow-up** rather than expanding `AuthService.login`'s blast radius here. During implementation, confirm the emulator's revoke behavior empirically and document whichever path is live.

## 5. Error model

`errors/email-change-error.codes.ts` defines the union; `EmailChangeException` subclasses carry the typed `error.code`; `EmailChangeExceptionFilter` maps to HTTP (shape identical to `PictureExceptionFilter`).

| Code | HTTP | Trigger | Web surface |
|------|------|---------|-------------|
| `EMAIL_INVALID` | 400 | new email empty / fails format | new-email field |
| `EMAIL_UNCHANGED` | 400 | new email equals current | new-email field |
| `CURRENT_PASSWORD_INVALID` | 400 | re-auth `signInWithPassword` fails | password field |
| `EMAIL_ALREADY_IN_USE` | 409 | Firebase `auth/email-already-exists` | new-email field |
| `EMAIL_CHANGE_FAILED` | 500 | link-gen / transport / other Firebase error | form-level banner |

## 6. Web UI

### 6.1 Profile page — inline "Change email" section

A collapsed-by-default section below the read-only email row on `ProfilePageComponent`:

- Reactive form fields: `newEmail`, `currentPassword`. Client-side format check on `newEmail` for fast feedback; server is authoritative.
- Submit → `EmailChangeService.requestChange()`. On `202` → collapse the form and show: *"We've sent a verification link to `{newEmail}`. Click it to finish changing your email — your current address stays active until you do."*
- On a typed error, map `error.code` to the offending field (mirrors `ProfilePageComponent.applyServerError`'s `setErrors({ server: reason })` pattern).
- `EmailChangeService` is a thin Promise-returning HTTP wrapper (`requestChange`, `confirm`); the component owns signal state (established web service-as-HTTP-wrapper pattern).

### 6.2 `EmailChangedComponent` — unguarded confirm landing

Route `settings/profile/email-changed` added to `profileRoutes` **without `authGuard`**:

```ts
{
  path: 'settings/profile/email-changed',
  loadComponent: () =>
    import('./email-changed/email-changed.component').then((m) => m.EmailChangedComponent),
}
```

`ngOnInit` → `emailChangeSvc.confirm()`:
- `{ changed: true }` or a `401` → `authSvc.setCurrentUser(null)`; `router.navigate(['/login'], { queryParams: { emailChanged: 1 } })`.
- `{ changed: false }` → `router.navigate(['/settings/profile'])`.

The login page reads `?emailChanged=1` to render a one-line notice: *"Your email was changed. Please sign in with your new address."*

## 7. Testing strategy

### Unit (vitest)

- `EmailChangeService`: re-auth failure → `CURRENT_PASSWORD_INVALID`; `auth/email-already-exists` → `EMAIL_ALREADY_IN_USE`; format and unchanged guards; confirm swap-detection (changed vs. no-op); confirm calls `revokeRefreshTokens` + Firestore sync on swap. Mock `FIREBASE_AUTH`, `FirebaseAuthRestClient`, `EMAIL_TRANSPORT`, `FIRESTORE`.
- `EmailChangeExceptionFilter`: code → HTTP status mapping.
- Web: `ProfilePageComponent` email section (success collapse + per-field error mapping); `EmailChangedComponent` (changed / no-op / 401 branches).
- ⚠️ vitest masks `tsc` errors — run `nx typecheck` explicitly (documented hazard).

### api-e2e (CI, no GCP credentials)

No new fake seam needed — unlike picture/cover, there is no external storage; the existing emulator + `_test/last-email` outbox cover the flow:

1. Register + login a user.
2. `POST /profile/email` with the new address + correct current password.
3. `GET /auth/_test/last-email?to={newEmail}&kind=email-change`; extract the `oobCode` from the URL.
4. Apply the action code via the Auth emulator's Identity Toolkit endpoint (`accounts:update` with `{ oobCode }`).
5. `POST /profile/email/confirm`; assert `changed: true` (or `401` if the emulator auto-revokes).
6. Assert login now succeeds with the **new** email and fails with the **old**.
7. Negative paths: wrong current password → `CURRENT_PASSWORD_INVALID`; new email belonging to a second account → `EMAIL_ALREADY_IN_USE`.

### web-e2e (Playwright)

- Drive the change-email form → assert the "verification sent" copy renders.
- Assert `EmailChangedComponent` redirects to `/login?emailChanged=1` (stub the `confirm` response). The full link-click round-trip stays in api-e2e.

## 8. Docs reconciliation (part of the slice)

- `README.md` — note Slice C wired up.
- `docs/USER_GUIDE.md` — document the change-email flow and that the old address stays active until verified.
- `docs/use-cases/01-user-identity-and-access.md` — update the UC-01-03 status banner: ext 3b shipped (Slice C); 3c / 3c-3a / 3c-4a (Slice D) still deferred.
- `docs/quality/spec-drift-report.md` — reconcile the EP-01 / UC-01-03 row, including the deliberate `EMAIL_ALREADY_IN_USE` enumeration divergence.
