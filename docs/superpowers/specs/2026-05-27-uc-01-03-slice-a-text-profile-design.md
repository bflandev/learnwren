> [!NOTE] DOCUMENT STATUS: DRAFT

# UC-01-03 Slice A — Text Profile Editing

**Use case:** [UC-01-03 — Manage User Profile](../../use-cases/01-user-identity-and-access.md#uc-01-03--manage-user-profile)

**Date:** 2026-05-27

## 1. Scope

This slice ships the **text-only** portion of UC-01-03: an authenticated user can edit their `displayName` and `biography`, and the new display name immediately surfaces in the app header.

### In scope

- New route `/settings/profile` gated by `authGuard`.
- Read current profile (`displayName`, `biography`, plus read-only `email` and `role`).
- Save updates to `displayName` (1–80 chars) and `biography` (≤1000 chars).
- Refresh the `AuthenticatedUser` snapshot held by `web-auth.AuthService` so the header updates without a full reload.
- New `biography` field on the `User` document; absence on existing docs reads as `''`.
- New Nest feature lib `api-profile` and Angular feature lib `web-profile`.

### Out of scope (deferred — each gets its own spec)

- **Slice B** — profile picture upload (JPEG/PNG, ≤2 MB). New `FakeProfilePictureStorageAdapter` seam, mirroring the cover-image pattern (`07a86e4`).
- **Slice C** — change email address (verification of the new address; keep current address active until verified — UC-01-03 extension 3b).
- **Slice D** — change password (current-password check + complexity reuse from `PasswordPolicyService` — UC-01-03 extensions 3c / 3c-3a / 3c-4a).
- Public read surfaces for `biography` (instructor bio on course catalog / detail). Stored only this slice; not surfaced anywhere yet.

## 2. Data model

Extend `libs/shared-data-models/src/lib/user.ts`:

```ts
export interface User {
  id: UserId;
  email: string;
  displayName: string;
  biography: string;        // NEW — '' default; ≤1000 chars
  role: UserRole;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

**Backfill:** none. Existing Firestore user documents do not have a `biography` field. The user-document repository (already in `api-auth`) reads `biography ?? ''` at the boundary so older docs continue to deserialize cleanly.

**`MeResponse` / `AuthenticatedUser` is unchanged.** The shape returned by `/api/auth/me` (typed as `MeResponse` on the backend and `AuthenticatedUser` on the frontend) does not gain `biography` — that is profile content, not session content, and is not needed by the header or any guard. The profile page fetches biography via `GET /api/profile`.

## 3. API contract

Both endpoints live in the new `api-profile` lib and are protected by `FirebaseSessionGuard`.

### `GET /api/profile`

Returns the current user's editable profile plus read-only fields:

```
200 OK
{
  uid: string,
  email: string,
  displayName: string,
  biography: string,
  role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN',
  emailVerified: boolean
}
```

`401` if no valid session cookie.

### `PATCH /api/profile`

```
Body:
  { displayName: string, biography: string }

200 OK → MeResponse            // same shape /api/auth/me returns
400 PROFILE_INVALID            // body: { code: 'PROFILE_INVALID', field, reason }
401                             // no session
```

The PATCH response is the updated `MeResponse` so the client can refresh its `AuthenticatedUser` signal in a single round-trip (see §5 for the `AuthService` change). The snapshot is built by the same `authService.getMe(uid, …)` helper `/api/auth/me` uses (see §4).

### Validation (server-authoritative)

| Field         | Rule                                                                |
| ------------- | ------------------------------------------------------------------- |
| `displayName` | required; trimmed; length 1–80 (matches existing register-page cap) |
| `biography`   | optional; trimmed; length 0–1000; empty string allowed              |

Both fields are stored trimmed.

On violation: throw `ProfileInvalidError(field, reason)` → translated to `400 { code: 'PROFILE_INVALID', field, reason }` by `ProfileExceptionFilter`. One error code, with a `field` hint so the client can attach the error to the right control.

## 4. Backend — `libs/api-profile`

New Nest feature lib registered in `apps/api/src/app/app.module.ts`.

```
libs/api-profile/src/lib/
  profile.module.ts
  profile.controller.ts            — @Get('/') @Patch('/')
  profile.controller.spec.ts
  profile.service.ts               — validation + Firestore write
  profile.service.spec.ts
  profile.exception-filter.ts      — per-feature (mirrors VideoExceptionFilter)
  profile.exception-filter.spec.ts
  dto/
    update-profile.dto.ts          — class-validator decorators
  errors/
    profile.errors.ts              — ProfileInvalidError
```

### Reuse from `api-auth`

- **User-document repository:** `profile.service` injects the same repository `api-auth` uses for `loadUserProfile`. Add an `update(uid, { displayName, biography, updatedAt })` method (or extend the existing repo's update shape) — `api-auth` does not currently need it but the shape is already a natural fit.
- **`authService.getMe(...)` helper:** `/api/auth/me` already calls `this.authService.getMe(uid, { email, emailVerified })` to build a `MeResponse` from a user record. Expose `getMe` from `api-auth` (or factor the implementation into a shared `me-response.builder.ts` if `getMe` carries unrelated auth concerns) so `profile.controller` can build a fresh `MeResponse` from the updated user record and return it. The PATCH response and `/api/auth/me` response must stay byte-identical in shape.

### Write path

`profile.service.updateProfile(uid, input)`:

1. Trim `displayName` and `biography`.
2. Validate lengths; throw `ProfileInvalidError(field, reason)` on the first failure.
3. Call `userRepo.update(uid, { displayName, biography, updatedAt: new Date().toISOString() })`.
4. Re-read the user record (or return the updated record from the write) and hand it to the snapshot builder.

`profile.service` does **not** touch Firebase Auth's own `displayName` field. The platform reads display name from Firestore everywhere it matters; Firebase Auth's copy is only set at register time and is not authoritative.

### Exception filter

`ProfileExceptionFilter`, registered on the controller via `@UseFilters(ProfileExceptionFilter)`. Maps `ProfileInvalidError` → 400 with the JSON body above. All other thrown errors pass through to Nest's default filter (which logs and 500s).

This follows the per-feature exception-filter pattern set by `VideoExceptionFilter` (see memory `feedback_api_courses_per_feature_filters.md`).

## 5. Frontend — `libs/web-profile`

New Angular feature lib.

```
libs/web-profile/src/lib/
  profile.routes.ts                — exports profileRoutes
  profile.service.ts               — HTTP wrapper
  profile.service.spec.ts
  profile-page/
    profile-page.component.ts
    profile-page.component.html
    profile-page.component.spec.ts
```

### Routing

`profile.routes.ts` exports:

```ts
export const profileRoutes: Route[] = [
  {
    path: 'settings/profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./profile-page/profile-page.component').then((m) => m.ProfilePageComponent),
  },
];
```

Wired into `apps/web/src/app/app.routes.ts` alongside the existing feature route arrays (`catalogRoutes`, `coursesRoutes`, `learnRoutes`).

### `profile.service` (HTTP wrapper)

Matches the established "service-as-HTTP-wrapper" pattern (memory `feedback_web_service_pattern.md`): returns Promises; the component owns signal state.

```ts
@Injectable({ providedIn: 'root' })
export class ProfileService {
  constructor(private http: HttpClient) {}

  getProfile(): Promise<ProfileView> { ... }                       // GET /api/profile
  updateProfile(input: UpdateProfileInput): Promise<AuthenticatedUser> { ... }  // PATCH /api/profile
}
```

`ProfileView` and `UpdateProfileInput` live in `libs/shared-data-models` so backend and frontend agree on shape.

### `profile-page.component`

- Reactive form: `displayName` (required, `Validators.maxLength(80)`), `biography` (`Validators.maxLength(1000)`).
- On init: `getProfile()` → patch form values; show `email` and `role` as read-only text.
- On submit:
  1. Validate client-side.
  2. Call `profileService.updateProfile(...)`.
  3. On 200: call `authService.setCurrentUser(me)` with the returned `AuthenticatedUser`, show "Profile updated" confirmation. **`AuthService` change required:** today `currentUserSignal` is private with no public setter. Add a public `setCurrentUser(user: AuthenticatedUser): void` method that writes to the signal. No other call site needs to change.
  4. On 400 `PROFILE_INVALID`: read `{ field, reason }`, attach the error to the matching form control (or show form-level for unknown field).
- Use existing PrimeNG / Tailwind primitives consistent with the design system (see `2026-05-22-design-system-adoption-design.md`).

### Header link

Add a "Profile settings" entry to the user menu in `apps/web/src/app/app.ts` (the same menu where the current display name is rendered). Click → router-navigate to `/settings/profile`.

## 6. Testing

### Backend — `libs/api-profile`

`profile.controller.spec.ts`
- `GET /api/profile` returns current profile (mocked user repo).
- `PATCH /api/profile` happy path returns a `MeResponse` reflecting the new values.
- `PATCH /api/profile` with empty `displayName` → 400 `{ field: 'displayName' }`.
- `PATCH /api/profile` with 81-char `displayName` → 400 `{ field: 'displayName' }`.
- `PATCH /api/profile` with 1001-char `biography` → 400 `{ field: 'biography' }`.
- `PATCH /api/profile` trims whitespace (input `'  Etta  '` stored as `'Etta'`).

`profile.service.spec.ts`
- Boundary lengths: 1, 80 (pass) / 0, 81 (fail) for `displayName`.
- Boundary lengths: 0, 1000 (pass) / 1001 (fail) for `biography`.
- Writes `updatedAt` on every successful update.
- Snapshot builder is invoked with the post-update user record.

`profile.exception-filter.spec.ts`
- `ProfileInvalidError('displayName', 'too short')` → 400 with `{ code: 'PROFILE_INVALID', field: 'displayName', reason: 'too short' }`.
- Unknown errors propagate (do not become 400).

Guard coverage (unauthenticated → 401) is already exercised by `FirebaseSessionGuard` tests in `api-auth`; the controller suite uses a stub guard, same as other feature controllers.

### Frontend — `libs/web-profile`

`profile.service.spec.ts`
- `HttpTestingController`: `getProfile()` issues GET `/api/profile` and parses the response.
- `updateProfile()` issues PATCH with the right body, returns the snapshot, surfaces HTTP errors.

`profile-page.component.spec.ts`
- Form populates from `getProfile()` on init.
- Submit calls `profileService.updateProfile` with current form values.
- On 200: `authService.setCurrentUser` is called with the returned `AuthenticatedUser`; success message is rendered.
- On 400 `PROFILE_INVALID` with `field: 'displayName'`: the displayName control shows an error; the form does not navigate away.
- Client-side `maxLength` validators fire for over-length input and block submit.

### E2E — `apps/web-e2e`

One Playwright golden-path test:

1. Register a fresh user → reaches `/dashboard`.
2. Open user menu → click "Profile settings" → lands on `/settings/profile`.
3. Form pre-fills with the registration display name; biography is empty.
4. Change display name to a new value; type a 200-char biography; submit.
5. Header now shows the new display name (no full reload).
6. Reload the page. Form re-renders with the persisted values.

Existing auth e2e tests are the structural model. Use the same emulator setup.

### Mutation testing

Add `api-profile` and `web-profile` to the round-3 mutation-testing backlog (memory `project_mutation_round_2.md`). Not gating on this slice — initial Vitest/Karma assertions are sufficient. The 80% adjusted threshold applies once round 3 runs.

## 7. Surfaces touched

- `libs/shared-data-models/src/lib/user.ts` — add `biography: string`.
- `libs/shared-data-models/src/lib/profile.ts` (new) — `ProfileView`, `UpdateProfileInput`, `PROFILE_INVALID` error-code constant.
- `libs/api-auth/` — expose `authService.getMe` (or factor a `me-response.builder.ts`) so `api-profile` can build the same `MeResponse`; expose `userRepo.update(...)` for partial-field writes.
- `libs/api-profile/` — new.
- `libs/web-profile/` — new.
- `libs/web-auth/src/lib/auth.service.ts` — add public `setCurrentUser(user: AuthenticatedUser): void` (currently the signal is private and only mutated by login/register/me internals).
- `apps/api/src/app/app.module.ts` — register `ProfileModule`.
- `apps/web/src/app/app.routes.ts` — spread `profileRoutes`.
- `apps/web/src/app/app.ts` — user-menu entry linking to `/settings/profile`.

## 8. Spec drift

After this slice ships, update:

- `docs/use-cases/01-user-identity-and-access.md` — UC-01-03 status banner: "Slice A (text profile) IMPLEMENTED on YYYY-MM-DD; picture/email/password slices deferred."
- `docs/quality/spec-drift-report.md` — flip UC-01-03 row to partial.
- `README.md` and `docs/USER_GUIDE.md` — add the profile-settings page to the list of implemented features.
