> [!NOTE] DOCUMENT STATUS: DRAFT

# UC-01-03 Slice D — Change Password

**Use case:** [UC-01-03 — Manage User Profile](../../use-cases/01-user-identity-and-access.md#uc-01-03--manage-user-profile) (extensions 3c / 3c-3a / 3c-4a)

**Date:** 2026-05-29

**Follows:** [Slice A — Text Profile Editing](./2026-05-27-uc-01-03-slice-a-text-profile-design.md) (shipped `168994f`), [Slice B — Profile Picture](./2026-05-28-uc-01-03-slice-b-profile-picture-design.md) (shipped `1f8a284`), and [Slice C — Change Email](./2026-05-28-uc-01-03-slice-c-email-change-design.md) (shipped `7075454`). This slice **closes UC-01-03**.

## 1. Scope

This slice ships UC-01-03 **extensions 3c / 3c-3a / 3c-4a**: an authenticated user changes their password from `/settings/profile`.

The flow:

1. The user enters their **current password** and a **new password** (with a client-side **confirm** field). The server re-authenticates with the current password, validates the new password against the existing complexity policy, then applies the change via `updateUser({ password })`.
2. On success the server sends a **"your password was changed"** security-notification email to the account address, revokes refresh tokens, and clears the session cookie.
3. The client clears its auth state and redirects to `/login?passwordChanged=1`, which renders a one-line success notice.

Three product decisions, settled during brainstorming, shape this slice:

- **Post-change session: force re-login.** `updateUser({ password })` revokes refresh tokens and advances `tokensValidAfterTime`, so the current session cookie becomes invalid on the next guarded request anyway. Rather than re-mint a cookie, we revoke explicitly, clear the cookie, and send the user to `/login`. This logs out all devices — the standard security behavior for a password change — and avoids the re-mint surface. Consistent with Slice C's force-re-login decision.
- **Security notification: included now.** A successful change sends a `password-changed` email. This is a deliberate divergence from Slice C, which deferred the analogous "notify the old address" email; here we add the small `EmailTransport` surface up front because a password change is the canonical account-security event that warrants a notification.
- **Reject no-op change.** If the new password equals the current password the server rejects with `PASSWORD_UNCHANGED` (400). The UC is silent on this; we add it as a small correctness nicety.

### In scope

- New `password/` submodule under `libs/api-profile` (mirrors the `email/` submodule layout): `PasswordChangeController`, `PasswordChangeService`, `password.exception-filter.ts`, `errors/password-change.exception.ts` + `errors/password-change-error.codes.ts`, `dto/change-password.dto.ts`.
- `POST /api/profile/password` (guarded by `FirebaseSessionGuard`), returning `204 No Content` on success.
- `PasswordPolicyService` added to `AuthModule.exports` and re-exported from `libs/api-auth/src/index.ts` (currently a provider only).
- New `EmailTransport.sendPasswordChangedEmail({ to })` method on the interface and both implementations (`ConsoleEmailTransport`, `SmtpEmailTransport`); new outbox `kind: 'password-changed'`; the `_test/last-email` endpoint's `kind` query union extended.
- Shared-model wire types and error-code constants in `libs/shared-data-models/src/lib/profile.ts`.
- Web: an inline, collapsed-by-default **"Change password"** section on the profile page; the login page reads `?passwordChanged=1` to render a one-line success notice.

### Out of scope (deferred — each tracked separately)

- Throttling the change endpoint. The current-password gate already blocks spam; if added later, the `AuthAttemptsRepository` throttle pattern is the natural home.
- A password-strength meter beyond the pass/fail complexity checklist.
- Re-minting a session cookie to keep the current device logged in (rejected in favour of force-re-login above).
- Surfacing the `password-changed` notification through a real SMTP template review — `SmtpEmailTransport` gets a functional subject/body mirroring the existing emails; copy polish is post-MVP.

## 2. Architecture

Following the Slice A/B/C precedent, **`libs/api-profile` owns the feature**, importing identity primitives from `api-auth`. The endpoint lives under the existing `/api/profile` namespace.

### 2.1 `api-auth` export widening

`AuthModule` already exports `FirebaseSessionGuard`, `InstructorRoleGuard`, `EMAIL_TRANSPORT`, `FirebaseAuthRestClient`, and `SessionCookieHelper` (the last three added by Slice C). This slice adds one more:

| Export | Why api-profile needs it |
|--------|--------------------------|
| `PasswordPolicyService` | Validate the new password against the shared 12-char + upper/lower/digit/special policy, reusing the exact rules registration enforces. |

`PasswordPolicyService` is re-exported from `libs/api-auth/src/index.ts` (along with its `PolicyRequirement` / `PasswordPolicyResult` types, needed for typing the unmet-requirements surface).

`FIREBASE_AUTH` is already a shared `api-firebase` provider, so api-profile injects it directly for `updateUser` and `revokeRefreshTokens`. `FirebaseAuthRestClient` (re-auth), `SessionCookieHelper` (cookie clear), and `EMAIL_TRANSPORT` (notification) are already exported.

### 2.2 New email-transport surface (`api-auth`)

```ts
// libs/api-auth/src/lib/email-transport/email-transport.ts
export interface PasswordChangedEmailInput {
  to: string; // the account address (unchanged by this flow)
}

export interface EmailTransport {
  sendUnlockEmail(input: UnlockEmailInput): Promise<void>;
  sendVerificationEmail(input: VerificationEmailInput): Promise<void>;
  sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void>;
  sendEmailChangeVerificationEmail(input: EmailChangeVerificationEmailInput): Promise<void>;
  sendPasswordChangedEmail(input: PasswordChangedEmailInput): Promise<void>; // NEW
}
```

- `ConsoleEmailTransport`: implement the method and append an outbox entry with `kind: 'password-changed'`. This is a **notification with no action link**, so the entry's `url` is the empty string (the `OutboxEntry.url` field stays required; an empty string is the sentinel for "no link"). Extend `OutboxEntry['kind']` accordingly.
- `SmtpEmailTransport`: implement the method (functional subject/body mirroring the existing notification emails).
- `AuthController._test/last-email`: extend the `kind` query union to `'unlock' | 'verification' | 'password-reset' | 'email-change' | 'password-changed'`.

### 2.3 `api-profile/password/` submodule

```
libs/api-profile/src/lib/password/
  password-change.controller.ts
  password-change.service.ts
  password.exception-filter.ts
  dto/change-password.dto.ts
  errors/password-change.exception.ts
  errors/password-change-error.codes.ts
```

Registered in `ProfileModule` alongside the existing controllers/providers. The controller carries `@UseFilters(PasswordChangeExceptionFilter)` and `@UseGuards(FirebaseSessionGuard)` (per-feature exception filter convention, established by `VideoExceptionFilter` / `PictureExceptionFilter` / `EmailChangeExceptionFilter`).

The DTO carries **no `class-validator` length/format decorators** — `@Allow()`-only, type-shape only — so the global `ValidationPipe` (configured with `whitelist`) cannot strip the fields or pre-empt the feature's typed error codes with a generic `BAD_REQUEST`. All validation lives in `PasswordChangeService`. (Documented short-circuit lesson from Slices C / the Nest ValidationPipe note.)

## 3. Data model

No shared-data-model entity changes. New wire DTOs and error codes in `libs/shared-data-models/src/lib/profile.ts`:

```ts
// Request — POST /api/profile/password
interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// Wire error codes (UC-01-03 ext 3c)
// CURRENT_PASSWORD_INVALID already exists (added by Slice C) — reuse it.
const NEW_PASSWORD_WEAK = 'NEW_PASSWORD_WEAK';
const PASSWORD_UNCHANGED = 'PASSWORD_UNCHANGED';
const PASSWORD_CHANGE_FAILED = 'PASSWORD_CHANGE_FAILED';

type PasswordChangeErrorCode =
  | typeof CURRENT_PASSWORD_INVALID
  | typeof NEW_PASSWORD_WEAK
  | typeof PASSWORD_UNCHANGED
  | typeof PASSWORD_CHANGE_FAILED;

// Body of a non-2xx from the password-change endpoint.
interface PasswordChangeErrorBody {
  error: {
    code: PasswordChangeErrorCode;
    message: string;
    details?: {
      field?: 'currentPassword' | 'newPassword';
      unmetRequirements?: PolicyRequirement[]; // present for NEW_PASSWORD_WEAK
    };
  };
}
```

`PolicyRequirement` is the union already defined in `api-auth`'s `PasswordPolicyService` (`'MIN_LENGTH' | 'UPPERCASE' | 'LOWERCASE' | 'DIGIT' | 'SPECIAL'`). The web mirrors this union (it cannot import a backend lib) the same way it mirrors other shared codes — via `shared-data-models`. To avoid a backend→frontend leak, the `PolicyRequirement` union is **re-declared in `shared-data-models`** as the canonical wire contract, and `PasswordPolicyService` is updated to import it from there (single source of truth; keeps the registration `WEAK_PASSWORD` surface and this slice aligned).

The success response has **no body** (`204 No Content`).

## 4. Data flow — `POST /api/profile/password`

`FirebaseSessionGuard`-protected. Body `{ currentPassword, newPassword }`. The controller passes `req.user.uid` and `req.user.email` (current address, from the cookie) into the service.

`PasswordChangeService.changePassword(uid, currentEmail, { currentPassword, newPassword })`:

1. **Re-authenticate.** `restClient.signInWithPassword({ email: currentEmail, password: currentPassword })`. On `AuthException` with `code === 'INVALID_CREDENTIALS'` → throw `CurrentPasswordInvalidException` (`CURRENT_PASSWORD_INVALID`, 400, `details.field = 'currentPassword'`). Any other re-auth error → `PasswordChangeFailedException` after logging.
2. **Validate complexity.** `passwordPolicy.validate(newPassword)`. If `{ valid: false, unmet }` → throw `WeakNewPasswordException(unmet)` (`NEW_PASSWORD_WEAK`, 400, `details.field = 'newPassword'`, `details.unmetRequirements = unmet`).
3. **Reject no-op.** If `newPassword === currentPassword` → throw `PasswordUnchangedException` (`PASSWORD_UNCHANGED`, 400, `details.field = 'newPassword'`). (Checked after complexity so the user fixes a weak password before being told it matches the old one.)
4. **Apply.** `await this.auth.updateUser(uid, { password: newPassword })`. On unexpected failure → `PasswordChangeFailedException` (`PASSWORD_CHANGE_FAILED`, 500) after logging. After this line the password is changed; subsequent steps must not roll it back.
5. **Notify (best-effort).** `await this.emailTransport.sendPasswordChangedEmail({ to: currentEmail })` inside a try/catch — a transport failure is **logged but swallowed**, because the password is already changed and failing the request would mislead the user into thinking the change didn't take.
6. **Revoke.** `await this.auth.revokeRefreshTokens(uid)` — the force-logout teeth, since `FirebaseSessionGuard` verifies cookies with `checkRevoked = true`. Idempotent.
7. The **controller** emits the clearing `Set-Cookie` via `SessionCookieHelper.toClearingCookie()` and returns `204`.

Client behavior: on `204`, clear client auth state (`authSvc.setCurrentUser(null)` / best-effort `logout()`), then `router.navigate(['/login'], { queryParams: { passwordChanged: 1 } })`.

## 5. Error model

`errors/password-change-error.codes.ts` defines the union; `PasswordChangeException` subclasses carry the typed `error.code` (+ optional `details`); `PasswordChangeExceptionFilter` maps to HTTP (shape identical to `EmailChangeExceptionFilter`, including the `AuthException` and `HttpException` fall-through branches so a guard-thrown `UnauthenticatedException` surfaces as `401` rather than a generic `500`).

| Code | HTTP | Trigger | Web surface |
|------|------|---------|-------------|
| `CURRENT_PASSWORD_INVALID` | 400 | re-auth `signInWithPassword` fails | current-password field |
| `NEW_PASSWORD_WEAK` | 400 | `PasswordPolicyService` reports unmet requirements | new-password field + checklist |
| `PASSWORD_UNCHANGED` | 400 | new password equals current | new-password field |
| `PASSWORD_CHANGE_FAILED` | 500 | `updateUser` / other unexpected error | form-level banner |

## 6. Web UI

### 6.1 Profile page — inline "Change password" section

A collapsed-by-default section below the "Change email" section on `ProfilePageComponent`:

- Reactive form fields: `currentPassword`, `newPassword`, `confirmNewPassword`.
- **Live complexity checklist** under `newPassword`, reusing the registration page's requirement-display logic (MIN_LENGTH / UPPERCASE / LOWERCASE / DIGIT / SPECIAL). Client-side check is for fast feedback; the server is authoritative.
- **Client-side confirm match**: `confirmNewPassword` must equal `newPassword` (a form-level validator); mismatch blocks submit and shows an inline message. This field is **never sent to the server**.
- Submit → `PasswordChangeService.change({ currentPassword, newPassword })`. On `204` → clear client auth state and redirect to `/login?passwordChanged=1`.
- On a typed error, map `error.code` → field via the existing `ProfilePageComponent.applyServerError` (`setErrors({ server: reason })`) pattern. `NEW_PASSWORD_WEAK` additionally highlights the unmet requirements from `details.unmetRequirements`; `PASSWORD_CHANGE_FAILED` shows a form-level banner.
- `PasswordChangeService` is a thin Promise-returning HTTP wrapper (`change()`); the component owns signal state (established web service-as-HTTP-wrapper pattern).

### 6.2 Login notice

The login page reads `?passwordChanged=1` (same mechanism as Slice C's `?emailChanged=1`) to render a one-line notice: *"Your password was changed. Please sign in with your new password."*

## 7. Testing strategy

### Unit (vitest)

- `PasswordChangeService`: re-auth failure → `CURRENT_PASSWORD_INVALID`; weak new password → `NEW_PASSWORD_WEAK` carrying `unmetRequirements`; `newPassword === currentPassword` → `PASSWORD_UNCHANGED`; happy path calls `updateUser` then `sendPasswordChangedEmail` then `revokeRefreshTokens`; a `sendPasswordChangedEmail` rejection is swallowed (request still succeeds, `revokeRefreshTokens` still called); `updateUser` failure → `PASSWORD_CHANGE_FAILED`. Mock `FIREBASE_AUTH`, `FirebaseAuthRestClient`, `PasswordPolicyService`, `EMAIL_TRANSPORT`.
- `PasswordChangeController`: success path sets the clearing cookie and returns `204`.
- `PasswordChangeExceptionFilter`: code → HTTP status mapping incl. `AuthException`/`HttpException` branches.
- `ConsoleEmailTransport`: `sendPasswordChangedEmail` appends a `password-changed` outbox entry retrievable via `lastSentTo`.
- Web: `ProfilePageComponent` password section (confirm-match validator; success → redirect; per-field error mapping; weak-password checklist); login-page notice.
- ⚠️ vitest masks `tsc` errors — run `nx typecheck` explicitly (documented hazard).

### api-e2e (CI, no GCP credentials)

No new fake seam needed — the existing emulator + `_test/last-email` outbox cover the flow:

1. Register + login a user.
2. `POST /profile/password` with the correct current password + a valid new password → assert `204` and a clearing `Set-Cookie`.
3. `GET /auth/_test/last-email?to={email}&kind=password-changed` → assert an entry exists.
4. Assert login now **fails** with the old password and **succeeds** with the new password.
5. Negative paths: wrong current password → `CURRENT_PASSWORD_INVALID`; weak new password → `NEW_PASSWORD_WEAK` (assert `details.unmetRequirements`); new equals current → `PASSWORD_UNCHANGED`.

### web-e2e (Playwright)

- Drive the change-password form with a stubbed `204` → assert redirect to `/login?passwordChanged=1` and that the notice renders.
- Assert the confirm-mismatch inline error blocks submit (no network call). The full credential round-trip stays in api-e2e.

## 8. Docs reconciliation (part of the slice)

- `README.md` — note Slice D wired up; UC-01-03 complete.
- `docs/USER_GUIDE.md` — document the change-password flow (current + new password, complexity rules, "you'll be signed out of all devices").
- `docs/use-cases/01-user-identity-and-access.md` — update the UC-01-03 status banner: ext 3c / 3c-3a / 3c-4a shipped (Slice D); **UC-01-03 now fully implemented**.
- `docs/quality/spec-drift-report.md` — reconcile the EP-01 / UC-01-03 row (note the `PASSWORD_UNCHANGED` addition beyond the UC and the force-logout-all-devices behavior).

## 9. Build sequence

1. `shared-data-models`: add `ChangePasswordRequest`, error-code constants, `PasswordChangeErrorCode`, `PasswordChangeErrorBody`, and the canonical `PolicyRequirement` union (+ its `.spec`).
2. `api-auth`: move `PolicyRequirement` to import from `shared-data-models`; export `PasswordPolicyService` (module + index); add `sendPasswordChangedEmail` to the interface + both transports + `OutboxEntry['kind']` + `_test/last-email` union (+ specs).
3. `api-profile/password/`: errors → exception → filter → DTO → service → controller; register in `ProfileModule` (TDD, per-file).
4. `web-profile`: `PasswordChangeService` → profile-page section; login-page notice.
5. e2e: api-e2e flow + negatives; web-e2e form + redirect.
6. Docs reconciliation.
7. `nx typecheck` + affected lint/test green; `--no-ff` merge to `main`.
