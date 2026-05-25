# Auth Hardening — Implementation Summary

**Date:** 2026-05-06
**Spec:** `docs/superpowers/specs/2026-05-06-auth-hardening-design.md`
**Plan:** `docs/superpowers/plans/2026-05-06-auth-hardening.md`

Closes the three deferred branches of UC-01-02: the strict email-verification gate (ext 4c), the 3-strike brute-force lockout (ext 4b), and the logged-out password-reset flow. Folds the post-registration auto-login and the login itself into a single API-mediated flow so NestJS is the chokepoint for every login policy decision. Removes the Firebase Auth client SDK from the web bundle as a side effect, and replaces the prior client-side `signInWithEmailAndPassword` round-trip plus `POST /auth/session` with a single `POST /auth/login` that verifies credentials via the Firebase Auth REST API and mints the `__session` cookie in the same response.

## What shipped

### NestJS (`libs/api-auth`)

- `errors/auth-error.codes.ts` + `errors/auth.exception.ts` — `AuthErrorCode` union extended with `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `ACCOUNT_LOCKED`, `TOO_MANY_REQUESTS`, `INVALID_UNLOCK_TOKEN`, `UNLOCK_TOKEN_EXPIRED`; six new named exception classes wired through the existing `AuthExceptionFilter` (covered by `auth.exception-filter.spec.ts`).
- `dto/login.dto.ts`, `dto/resend-verification.dto.ts`, `dto/request-password-reset.dto.ts`, `dto/unlock.dto.ts` — class-validator DTOs for the four new endpoint bodies. `dto/session.dto.ts` is gone.
- `auth-attempts.repository.ts` — sole owner of the `auth_attempts/{emailHash}` collection. Doc IDs are `sha256(email.trim().toLowerCase())` hex. Transactional `recordFailure` increments the counter and transitions to LOCKED on the third failure (`lockedUntil = now + 15min`, base64url-32-byte `unlockToken`). `read`, `redeemUnlockToken`, and `recordFailure` all apply lazy auto-expiry. `recordResendVerification` / `recordPasswordResetRequest` enforce the 60-second per-email throttle on the same doc. Backed by `auth-attempts.repository.spec.ts` with a hand-built fake Firestore.
- `firebase-auth-rest-client.ts` — thin wrapper around `identitytoolkit.signInWithPassword`. Auto-detects `FIREBASE_AUTH_EMULATOR_HOST` and rewrites the URL; maps `EMAIL_NOT_FOUND`, `INVALID_PASSWORD`, `INVALID_LOGIN_CREDENTIALS`, and `USER_DISABLED` to `InvalidCredentialsException`; anything else to `InternalAuthException`. Consumes a new `FIREBASE_WEB_API_KEY` DI token added in `libs/api-firebase/src/lib/firebase.tokens.ts` and provided by `FirebaseAdminModule`.
- `email-transport/` — `EmailTransport` interface (`sendUnlockEmail`, `sendVerificationEmail`, `sendPasswordResetEmail`), `ConsoleEmailTransport` (logger-based, plus an in-process outbox keyed by `to` + `kind`), `SmtpEmailTransport` (Nodemailer), and `email-transport.factory.ts` selecting on `LEARNWREN_EMAIL_TRANSPORT=console|smtp`.
- `auth.service.ts` — `login` runs lockout-check → REST credential verify → verification gate → session cookie mint → `clear` of the attempts doc; `register` now mints the cookie internally via the same REST + `createSessionCookie` path (no client-side sign-in afterwards); new `resendVerification`, `requestPasswordReset` (silent-202 on enumeration paths, does not mutate lockout state), and `unlock` (delegates to `redeemUnlockToken`, throws 400/410 on bad/expired tokens).
- `auth.controller.ts` — `POST /auth/login` (200), `POST /auth/resend-verification` (202), `POST /auth/request-password-reset` (202), `POST /auth/unlock` (204). `POST /auth/session` is removed; `register` / `logout` / `me` are unchanged at the controller surface (register's service-side body changed). A test-mode-only `GET /auth/_test/last-email` was added — see deviations.
- `auth.module.ts` — wires `AuthAttemptsRepository`, `FirebaseAuthRestClient`, and the `EMAIL_TRANSPORT` provider via the factory.

### Angular (`libs/web-auth`)

- `auth.service.ts` — fully refactored. No `firebase/auth` import. `login` posts to `/api/auth/login` and returns a `LoginResult` discriminated union (`{ok:true}` or `{ok:false, code:'INVALID_CREDENTIALS'|'EMAIL_NOT_VERIFIED'|'ACCOUNT_LOCKED', details?}`). `register` no longer follows up with a client-side sign-in. `logout` just posts to `/api/auth/logout` and clears the signal. New: `resendVerification`, `requestPasswordReset`, `unlock`.
- `login-page/` — extended to render the three new error states (`401`, `403` with Resend button, `423` with HH:MM and the just-reset hint when `?reset=ok` is present) and a "Forgot password?" link.
- `register-page/` + `register-confirm-page/` — the post-registration confirmation view is now its own route (`/register/confirm`) with a 60-second-cooldown "Resend" button calling `resendVerification`.
- `forgot-password-page/` — single-field form, enumeration-resistant confirmation copy regardless of result.
- `unlock-page/` — reads `?token=...` on init, calls `unlock`, renders one of three terminal states (ok / expired with reset link / invalid).
- `web-auth/web-auth.routes.ts` and `apps/web/src/app/app.routes.ts` — `/register/confirm`, `/forgot-password`, `/auth/unlock` are public.

### Web bundle

- `firebase` is no longer a dependency of `apps/web` (no matches for `firebase/auth` or `from 'firebase'` under `apps/web` or `libs/web-auth`). `provideFirebaseApp` / `provideAuth` providers and the client-side `firebase` env file are deleted. The Web API key now lives only on the server.

### Rules

- `firestore.rules` and `firestore.emulator.rules` both add `match /auth_attempts/{emailHash} { allow read, write: if false; }`. Server-only access via Admin SDK.

### Tests

- Unit (`libs/api-auth`): new specs for `auth-attempts.repository`, `firebase-auth-rest-client`, `console-email-transport`, `smtp-email-transport`, `email-transport.factory`, plus extensions to `auth.service.spec.ts`, `auth.controller.spec.ts`, and `auth.exception-filter.spec.ts` for the new error mappings.
- Unit (`libs/web-auth`): `forgot-password-page`, `unlock-page`, `register-confirm-page` component specs; `auth.service.spec.ts` and `login-page.component.spec.ts` extended for the new flows and error-state rendering.
- API e2e (`apps/api-e2e/src/auth.e2e-spec.ts`): happy-path adapted to single-trip register (no `/auth/session`); new cases for the verification gate, lockout transition + unlock-token redemption, resend throttle, password-reset request, "reset does not clear lockout", and enumeration-resistance structural assertions.
- Rules (`apps/api-e2e/src/firestore-rules.e2e-spec.ts`): authenticated and unauthenticated clients are denied both read and write on `auth_attempts/{*}`.

### Migration / ops

- `tools/migrate-auth-2026-05-cleanup-unverified.ts` — idempotent Admin-SDK script that deletes unverified Firebase Auth users and their `users/{uid}` docs. Intended for one-shot use against the dev/test project before the gate goes unconditional.
- `.env.tpl` — adds `FIREBASE_WEB_API_KEY`, `LEARNWREN_EMAIL_TRANSPORT` (default `console`), `LEARNWREN_EMAIL_FROM`, and commented-out `SMTP_*` placeholders. `nodemailer` + `@types/nodemailer` added to `package.json`.

### Documentation

- `README.md` — EP-01 ship-record line lists "email-verification gate, brute-force lockout + email unlock, logged-out password reset"; the dev walkthrough has a step that exercises the lockout via the `ConsoleEmailTransport` log output; the spec is linked alongside the prior auth slice.

## Plan deviations worth knowing about

- **`EmailTransport` interface grew two extra methods.** Spec §3.7 scoped the transport to "unlock email only" (verification + reset to stay Firebase-templated), but the shipped interface also exposes `sendVerificationEmail` and `sendPasswordResetEmail`, and `ConsoleEmailTransport` records all three kinds in an in-process outbox. This was driven by the api-e2e need to read back a freshly-issued verification or reset link end-to-end without round-tripping through Firebase's email simulation; the production path still uses Firebase's templated senders via `generate*Link`, but the transport layer is the in-process sink.
- **Test-mode-only `GET /auth/_test/last-email` endpoint** was added to `AuthController` (not in the spec or plan). Double-gated on `NODE_ENV !== 'production'` *and* `LEARNWREN_TEST_OUTBOX_ENABLED === '1'`, and additionally only responds when `EMAIL_TRANSPORT` is a `ConsoleEmailTransport`. Returns `404` otherwise. Drives the api-e2e suites that exercise the unlock / verify / reset redemption flows.
- **Plan checkbox state.** All 152 plan checkboxes are still `- [ ]`; nothing was marked off during execution. The commits in the 2026-05-06 → 2026-05-15 window line up one-to-one with the plan's task list (Tasks 1–28), so the work landed — the checkboxes just never got updated.
- **Post-merge follow-ups in the same window.** A small set of fixes landed after the main slice: `fix(api-auth): null-guard query.docs[0] in redeemUnlockToken` (`e9d140b`), `fix(api-e2e): isolate rules suite project from API to stop clearFirestore cross-contamination` (`c10bb98`), and a quality refresh (`chore(quality): add Stryker mutation testing for api-auth and triage report` `ac1c9f0`; `test(api-auth): close mutation-test gaps; score 75.66% → 88.94%` `d90c588`).

## Verification outcome

- Unit tests: `libs/api-auth` and `libs/web-auth` Vitest suites are committed and pass locally per the commit log; api-auth mutation score was lifted to 88.94% (97.10% post-equivalents) in `d90c588`.
- API e2e: `apps/api-e2e/src/auth.e2e-spec.ts` was adapted to the single-trip register (`0677f60`) and extended with the lockout, verification-gate, throttle, reset, and enumeration cases (`ec67d1d`). The rules suite was isolated into its own Nx project to stop `clearFirestore` cross-contamination (`c10bb98`). All run against the local Firebase emulator suite.
- The manual verification checklist in spec §6.4 (register → verify → log in, deliberate three-strike lockout, click unlock link, request password reset, lockout-not-cleared-by-reset path) is documented as runnable locally and the `ConsoleEmailTransport` log lines surface the unlock URL for step 3; live execution against the real `learn-wren` project remains an operator task.
- The pre-deploy migration script `tools/migrate-auth-2026-05-cleanup-unverified.ts` is committed and idempotent; a live run against the dev/test project is operator-driven.

## Follow-ups not in scope

Per spec §9 and the corresponding Non-Goals:

- UC-01-03 — profile editing, logged-in password change, email change with re-verification.
- UC-01-04 — instructor-role request flow.
- UC-01-02 ext 4d — suspended-account handling (depends on admin UI).
- Custom branded `/auth/action` handler to replace Firebase's hosted verification + reset action page; custom email templates / branded sender.
- Per-IP rate limiting and credential-stuffing defense (lockout here is per-email only).
- Firestore TTL policy on `auth_attempts` for orphan cleanup.
- Cloud Functions packaging of `apps/api`; Firebase Hosting deploys / SPA rewrites.
- Live unlock-countdown timer in the UI (the current rendering is the static "Try again at HH:MM").
