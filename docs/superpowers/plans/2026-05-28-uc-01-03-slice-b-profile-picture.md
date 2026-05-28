# UC-01-03 Slice B — Profile Picture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the profile-picture portion of UC-01-03 — an authenticated user can upload/replace/remove a JPEG/PNG avatar from `/settings/profile`; the avatar surfaces immediately in the header user-menu chip; the public catalog renders the instructor's avatar on course cards; the course detail page renders avatar + biography in an instructor card.

**Architecture:** New `picture/` submodule under `libs/api-profile/` mirroring the `cover/` submodule under `libs/api-courses/` (own controller, service, exception filter, storage port + Firebase adapter + fake adapter, config). Server-side validation and normalisation via `sharp`: ≥256×256 natural, centre-crop to square, downscale to 512×512 JPEG (mozjpeg, q=85). Storage at `profile-pictures/{uid}/avatar.jpg`; cache busting via `?v={User.updatedAt}` baked into the stored `photoUrl`. New `LwAvatarComponent` + `avatarToneFor()` in `libs/web-ui` alongside the existing `LwCoverComponent`. New `picture/` submodule under `libs/web-profile/` with a Promise-returning service and a state-owning uploader. `InstructorDirectory` widens from `displayNamesFor` → `instructorRefsFor` so the catalog projection can join `photoUrl` (and `biography` for detail) in the same deduped read.

**Tech Stack:** NestJS 11 + `@nestjs/platform-express` + `multer` + `sharp` (already deps of the cover slice); Firebase Admin Storage + Firestore; Angular 21 reactive signals + `HttpClient`; vitest for unit tests; Playwright for `apps/api-e2e` and `apps/web-e2e`; Nx 22 monorepo with pnpm.

**Spec:** `docs/superpowers/specs/2026-05-28-uc-01-03-slice-b-profile-picture-design.md`

**Direct precedents:**
- Cover image slice (commit `07a86e4`, plan `docs/superpowers/plans/2026-05-25-cover-image-upload.md`) — the architectural template. Many tasks here say "mirror cover precedent at `<path>`" rather than re-deriving the pattern.
- UC-01-03 Slice A (commit `168994f`, plan `docs/superpowers/plans/2026-05-27-uc-01-03-slice-a-text-profile.md`) — the `api-profile` / `web-profile` libs and the `AuthService.setCurrentUser` helper already exist.

**Worktree (per user memory):**

```bash
git worktree add -b feat/uc-01-03-slice-b-profile-picture \
  /Volumes/Artie-Storage/github-repos/learnwren-uc-01-03-slice-b HEAD
ln -s /Volumes/Artie-Storage/github-repos/learnwren/node_modules \
  /Volumes/Artie-Storage/github-repos/learnwren-uc-01-03-slice-b/node_modules
cd /Volumes/Artie-Storage/github-repos/learnwren-uc-01-03-slice-b
```

The `node_modules` symlink evades `.gitignore`'s `node_modules/` rule — **never run `git add -A`**; always stage individual files. Land via local `--no-ff` merge to `main`.

**Worktree dist hazard (memory `feedback_worktree_dist_hazard.md`):** if Nx serves stale `.d.ts` from `dist/out-tsc`, nuke `dist/` and rerun with `NX_DAEMON=false`.

**Subagent worktree guard (memory `feedback_subagent_worktree_guard.md`):** when dispatching subagents into this worktree, every command must be prefixed `cd /Volumes/Artie-Storage/github-repos/learnwren-uc-01-03-slice-b && pwd && …`.

---

## File Structure

### New files

```
libs/api-profile/src/lib/picture/
  errors/
    picture-error.codes.ts                — string-literal union of error codes
    picture.exception.ts                  — PictureException + concrete subclasses
    picture.exception.spec.ts             — type/construction tests
  picture.config.ts                       — env → { bucket, publicBaseUrl, impl }
  picture.config.spec.ts
  picture-storage.adapter.ts              — PictureStoragePort + Firebase impl
  picture-storage.adapter.spec.ts
  fake-picture-storage.adapter.ts         — in-memory implementation for tests + local
  fake-picture-storage.adapter.spec.ts
  picture.exception-filter.ts             — per-feature filter
  picture.exception-filter.spec.ts
  profile-picture.service.ts              — sharp pipeline + storage + user patch
  profile-picture.service.spec.ts
  profile-picture.controller.ts           — PUT / DELETE /api/profile/picture
  profile-picture.controller.spec.ts

libs/web-profile/src/lib/picture/
  profile-picture.service.ts
  profile-picture.service.spec.ts
  profile-picture-uploader.component.ts
  profile-picture-uploader.component.html
  profile-picture-uploader.component.spec.ts

libs/web-ui/src/lib/avatar/
  lw-avatar.component.ts
  lw-avatar.component.spec.ts
  avatar-tone.ts
  avatar-tone.spec.ts

apps/api-e2e/src/
  profile-picture.e2e-spec.ts             — golden path via FakePictureStorage

apps/web-e2e/src/
  profile-picture.spec.ts                 — register → upload → header avatar → reload → remove
```

### Modified files

```
libs/shared-data-models/src/lib/user.ts                       — + photoUrl?
libs/shared-data-models/src/lib/user.spec.ts                  — + assertion case
libs/shared-data-models/src/lib/auth.ts                       — + MeResponse.photoUrl?
libs/shared-data-models/src/lib/profile.ts                    — + ProfileView.photoUrl?, picture wire-error codes
libs/shared-data-models/src/lib/profile.spec.ts               — + assertion cases
libs/shared-data-models/src/lib/catalog.ts                    — + instructorId, instructorPhotoUrl?, instructorBiography?
libs/shared-data-models/src/lib/catalog.spec.ts               — + assertion cases
libs/api-auth/src/lib/auth.service.ts                         — getMe + loadUserProfile read photoUrl
libs/api-auth/src/lib/auth.service.spec.ts                    — + photoUrl plumb assertions
libs/api-profile/src/lib/profile.service.ts                   — UserDoc + getProfile/updateProfile plumb photoUrl
libs/api-profile/src/lib/profile.service.spec.ts              — + photoUrl assertions
libs/api-profile/src/lib/profile.module.ts                    — register picture providers + controller
libs/api-courses/src/lib/catalog/instructor-directory.ts      — widen to instructorRefsFor
libs/api-courses/src/lib/catalog/instructor-directory.spec.ts — + photoUrl/biography assertions
libs/api-courses/src/lib/catalog/catalog.service.ts           — thread instructorId + instructorPhotoUrl + (detail) instructorBiography
libs/api-courses/src/lib/catalog/catalog.service.spec.ts      — + projection assertions
apps/api/src/app/app.module.ts                                — wire picture config providers
storage.rules                                                 — open profile-pictures/** for public read
libs/web-ui/src/index.ts                                      — re-export LwAvatarComponent + avatarToneFor
libs/web-profile/src/lib/profile-page/profile-page.component.ts  — mount <lib-profile-picture-uploader>
libs/web-profile/src/lib/profile-page/profile-page.component.html
libs/web-profile/src/lib/profile-page/profile-page.component.spec.ts
libs/web-profile/src/index.ts                                 — re-export ProfilePictureUploaderComponent (if needed)
apps/web/src/app/app.ts                                       — header chip swaps to <lw-avatar>
apps/web/src/app/app.spec.ts                                  — + chip avatar assertions
libs/web-catalog/src/lib/components/course-card/course-card.component.{ts,html,spec.ts}  — avatar slot
libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.{ts,html,spec.ts} — instructor block
docs/use-cases/01-user-identity-and-access.md                 — flip UC-01-03 status
docs/quality/spec-drift-report.md                             — close picture row; carry email/password forward
README.md                                                     — flip "picture deferred" bullet
docs/USER_GUIDE.md                                            — document upload/replace/remove + avatar fallback
```

---

## Task 1: `User.photoUrl?` shared model

**Files:**
- Modify: `libs/shared-data-models/src/lib/user.ts`
- Test: `libs/shared-data-models/src/lib/user.spec.ts` (or `shared-data-models.spec.ts` if a User-specific file does not exist)

- [ ] **Step 1: Write the failing test**

Append to the relevant model spec (create one if no `user.spec.ts` exists, mirroring `course.spec.ts`):

```ts
import type { User } from './user';

describe('User — profile picture', () => {
  it('accepts a User with photoUrl set', () => {
    const u: User = {
      id: 'u1' as User['id'],
      email: 'a@b.com',
      displayName: 'Ada',
      biography: '',
      photoUrl: 'https://example.com/p/u1/avatar.jpg?v=2026-05-28T00:00:00.000Z',
      role: 'STUDENT',
      createdAt: '2026-05-28T00:00:00.000Z' as User['createdAt'],
      updatedAt: '2026-05-28T00:00:00.000Z' as User['updatedAt'],
    };
    expect(u.photoUrl).toContain('avatar.jpg');
  });

  it('accepts a User without photoUrl (field is optional)', () => {
    const u: User = {
      id: 'u1' as User['id'],
      email: 'a@b.com',
      displayName: 'Ada',
      biography: '',
      role: 'STUDENT',
      createdAt: '2026-05-28T00:00:00.000Z' as User['createdAt'],
      updatedAt: '2026-05-28T00:00:00.000Z' as User['updatedAt'],
    };
    expect(u.photoUrl).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm nx test shared-data-models --skip-nx-cache
```

Expected: type error on `photoUrl` (not assignable / not declared on `User`).

- [ ] **Step 3: Make it pass — add the field**

```ts
// libs/shared-data-models/src/lib/user.ts
export interface User {
  id: UserId;
  email: string;
  displayName: string;
  biography: string;
  photoUrl?: string;          // NEW
  role: UserRole;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test shared-data-models
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data-models/src/lib/user.ts libs/shared-data-models/src/lib/user.spec.ts
git commit -m "feat(shared-data-models): add optional User.photoUrl"
```

---

## Task 2: `MeResponse.photoUrl?` shared model

**Files:**
- Modify: `libs/shared-data-models/src/lib/auth.ts`
- Test: extend an existing auth model spec, or create `libs/shared-data-models/src/lib/auth.spec.ts` if none

- [ ] **Step 1: Write the failing test**

```ts
import type { MeResponse } from './auth';

describe('MeResponse — photoUrl', () => {
  it('accepts a snapshot with photoUrl set', () => {
    const me: MeResponse = {
      uid: 'u1' as MeResponse['uid'],
      email: 'a@b.com',
      displayName: 'Ada',
      photoUrl: 'https://example.com/p/u1/avatar.jpg?v=…',
      role: 'STUDENT',
      emailVerified: true,
    };
    expect(me.photoUrl).toBeTypeOf('string');
  });

  it('accepts a snapshot without photoUrl', () => {
    const me: MeResponse = {
      uid: 'u1' as MeResponse['uid'],
      email: 'a@b.com',
      displayName: 'Ada',
      role: 'STUDENT',
      emailVerified: true,
    };
    expect(me.photoUrl).toBeUndefined();
  });
});
```

- [ ] **Step 2: Verify it fails**

```bash
pnpm nx test shared-data-models
```

- [ ] **Step 3: Make it pass**

```ts
// libs/shared-data-models/src/lib/auth.ts
export interface MeResponse {
  uid: UserId;
  email: string;
  displayName: string;
  photoUrl?: string;     // NEW
  role: UserRole;
  emailVerified: boolean;
}
```

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test shared-data-models
```

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data-models/src/lib/auth.ts libs/shared-data-models/src/lib/auth.spec.ts
git commit -m "feat(shared-data-models): add optional MeResponse.photoUrl"
```

---

## Task 3: `ProfileView.photoUrl?` + picture wire-error codes shared

**Files:**
- Modify: `libs/shared-data-models/src/lib/profile.ts`
- Test: `libs/shared-data-models/src/lib/profile.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `profile.spec.ts`:

```ts
import {
  PROFILE_PICTURE_DIMENSIONS_TOO_SMALL,
  PROFILE_PICTURE_DECODE_FAILED,
  PROFILE_PICTURE_TOO_LARGE,
  UNSUPPORTED_PROFILE_PICTURE_FORMAT,
  type ProfileView,
} from './profile';

describe('ProfileView — photoUrl', () => {
  it('accepts a view with photoUrl set', () => {
    const v: ProfileView = {
      uid: 'u1' as ProfileView['uid'],
      email: 'a@b.com',
      displayName: 'Ada',
      biography: '',
      photoUrl: 'https://example.com/p/u1/avatar.jpg?v=…',
      role: 'STUDENT',
      emailVerified: true,
    };
    expect(v.photoUrl).toContain('avatar.jpg');
  });

  it('accepts a view without photoUrl', () => {
    const v: ProfileView = {
      uid: 'u1' as ProfileView['uid'],
      email: 'a@b.com',
      displayName: 'Ada',
      biography: '',
      role: 'STUDENT',
      emailVerified: true,
    };
    expect(v.photoUrl).toBeUndefined();
  });
});

describe('Picture wire-error codes', () => {
  it('exposes the four picture codes as string literals', () => {
    expect(PROFILE_PICTURE_DIMENSIONS_TOO_SMALL).toBe('PROFILE_PICTURE_DIMENSIONS_TOO_SMALL');
    expect(PROFILE_PICTURE_DECODE_FAILED).toBe('PROFILE_PICTURE_DECODE_FAILED');
    expect(PROFILE_PICTURE_TOO_LARGE).toBe('PROFILE_PICTURE_TOO_LARGE');
    expect(UNSUPPORTED_PROFILE_PICTURE_FORMAT).toBe('UNSUPPORTED_PROFILE_PICTURE_FORMAT');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test shared-data-models
```

- [ ] **Step 3: Make it pass — extend `profile.ts`**

```ts
// libs/shared-data-models/src/lib/profile.ts
export interface ProfileView {
  uid: UserId;
  email: string;
  displayName: string;
  biography: string;
  photoUrl?: string;        // NEW
  role: UserRole;
  emailVerified: boolean;
}

// (existing UpdateProfileInput, PROFILE_INVALID, ProfileInvalidErrorBody unchanged)

export const PROFILE_PICTURE_DIMENSIONS_TOO_SMALL = 'PROFILE_PICTURE_DIMENSIONS_TOO_SMALL';
export type ProfilePictureDimensionsTooSmallCode = typeof PROFILE_PICTURE_DIMENSIONS_TOO_SMALL;

export const PROFILE_PICTURE_DECODE_FAILED = 'PROFILE_PICTURE_DECODE_FAILED';
export type ProfilePictureDecodeFailedCode = typeof PROFILE_PICTURE_DECODE_FAILED;

export const PROFILE_PICTURE_TOO_LARGE = 'PROFILE_PICTURE_TOO_LARGE';
export type ProfilePictureTooLargeCode = typeof PROFILE_PICTURE_TOO_LARGE;

export const UNSUPPORTED_PROFILE_PICTURE_FORMAT = 'UNSUPPORTED_PROFILE_PICTURE_FORMAT';
export type UnsupportedProfilePictureFormatCode = typeof UNSUPPORTED_PROFILE_PICTURE_FORMAT;

export type ProfilePictureErrorCode =
  | ProfilePictureDimensionsTooSmallCode
  | ProfilePictureDecodeFailedCode
  | ProfilePictureTooLargeCode
  | UnsupportedProfilePictureFormatCode;
```

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test shared-data-models
```

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data-models/src/lib/profile.ts libs/shared-data-models/src/lib/profile.spec.ts
git commit -m "feat(shared-data-models): add ProfileView.photoUrl and picture wire-error codes"
```

---

## Task 4: `CourseSummary` + `CourseCatalogDetail` instructor extensions

**Files:**
- Modify: `libs/shared-data-models/src/lib/catalog.ts`
- Test: `libs/shared-data-models/src/lib/catalog.spec.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('CourseSummary — instructor avatar fields', () => {
  it('exposes instructorId and accepts optional instructorPhotoUrl', () => {
    const s: CourseSummary = {
      id: 'c1' as CourseSummary['id'],
      title: 'Intro',
      description: 'x',
      instructorId: 'u1' as CourseSummary['instructorId'],
      instructorDisplayName: 'Ada',
      instructorPhotoUrl: 'https://example.com/p/u1/avatar.jpg?v=…',
      publishedAt: '2026-05-28T00:00:00.000Z' as CourseSummary['publishedAt'],
    };
    expect(s.instructorId).toBe('u1');
    expect(s.instructorPhotoUrl).toContain('avatar.jpg');
  });

  it('accepts CourseSummary with no instructorPhotoUrl', () => {
    const s: CourseSummary = {
      id: 'c1' as CourseSummary['id'],
      title: 'Intro',
      description: 'x',
      instructorId: 'u1' as CourseSummary['instructorId'],
      instructorDisplayName: 'Ada',
      publishedAt: '2026-05-28T00:00:00.000Z' as CourseSummary['publishedAt'],
    };
    expect(s.instructorPhotoUrl).toBeUndefined();
  });
});

describe('CourseCatalogDetail — instructor block', () => {
  it('carries instructorId, optional photoUrl, optional biography', () => {
    const d: CourseCatalogDetail = {
      id: 'c1' as CourseCatalogDetail['id'],
      title: 'Intro',
      description: 'x',
      instructorId: 'u1' as CourseCatalogDetail['instructorId'],
      instructorDisplayName: 'Ada',
      instructorPhotoUrl: 'https://example.com/p/u1/avatar.jpg?v=…',
      instructorBiography: 'Mathematician.',
      lessonCount: 0,
      modules: [],
      publishedAt: '2026-05-28T00:00:00.000Z' as CourseCatalogDetail['publishedAt'],
    };
    expect(d.instructorBiography).toBe('Mathematician.');
  });

  it('accepts CourseCatalogDetail without photoUrl or biography', () => {
    const d: CourseCatalogDetail = {
      id: 'c1' as CourseCatalogDetail['id'],
      title: 'Intro',
      description: 'x',
      instructorId: 'u1' as CourseCatalogDetail['instructorId'],
      instructorDisplayName: 'Ada',
      lessonCount: 0,
      modules: [],
      publishedAt: '2026-05-28T00:00:00.000Z' as CourseCatalogDetail['publishedAt'],
    };
    expect(d.instructorBiography).toBeUndefined();
    expect(d.instructorPhotoUrl).toBeUndefined();
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test shared-data-models
```

- [ ] **Step 3: Make it pass**

```ts
// libs/shared-data-models/src/lib/catalog.ts
import type { CourseId, ISODateString, LessonId, UserId } from './common';
import type { CourseCategory, CourseDifficulty } from './course';

export interface CourseSummary {
  id: CourseId;
  title: string;
  description: string;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
  instructorId: UserId;              // NEW
  instructorDisplayName: string;
  instructorPhotoUrl?: string;       // NEW
  publishedAt: ISODateString;
  coverImageUrl?: string;
}

// (CourseCatalogPage, CATALOG_SORT_OPTIONS, CatalogSort, CATALOG_PAGE_SIZE, CatalogModuleOutline unchanged)

export interface CourseCatalogDetail {
  id: CourseId;
  title: string;
  description: string;
  longDescription?: string;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
  instructorId: UserId;              // NEW
  instructorDisplayName: string;
  instructorPhotoUrl?: string;       // NEW
  instructorBiography?: string;      // NEW (undefined when empty/absent)
  lessonCount: number;
  modules: CatalogModuleOutline[];
  publishedAt: ISODateString;
  coverImageUrl?: string;
}
```

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test shared-data-models
```

This will surface downstream type errors in `libs/web-catalog/...spec.ts` and `libs/api-courses/src/lib/catalog/catalog.service.ts` — those are handled in Tasks 9 and 10. For now confirm `shared-data-models` itself is green.

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data-models/src/lib/catalog.ts libs/shared-data-models/src/lib/catalog.spec.ts
git commit -m "feat(shared-data-models): add instructorId, instructorPhotoUrl, instructorBiography to catalog shapes"
```

---

## Task 5: `api-auth.getMe` + `loadUserProfile` plumb `photoUrl`

**Files:**
- Modify: `libs/api-auth/src/lib/auth.service.ts:280-309`
- Test: `libs/api-auth/src/lib/auth.service.spec.ts`

- [ ] **Step 1: Locate the existing `getMe` spec coverage**

```bash
grep -n "getMe\|loadUserProfile" libs/api-auth/src/lib/auth.service.spec.ts | head -20
```

Note the test names so the new cases sit next to them.

- [ ] **Step 2: Write the failing test**

Add to `auth.service.spec.ts` in the `getMe` describe block:

```ts
it('includes photoUrl in MeResponse when the user doc carries one', async () => {
  // Mirror existing test setup; the stubbed firestore should return a user doc
  // shape including photoUrl.
  fakeFirestore.set('users/u1', {
    displayName: 'Ada',
    role: 'STUDENT',
    photoUrl: 'https://example.com/p/u1/avatar.jpg?v=2026-05-28T00:00:00.000Z',
  });
  const me = await service.getMe('u1' as UserId, { email: 'a@b.com', emailVerified: true });
  expect(me.photoUrl).toBe('https://example.com/p/u1/avatar.jpg?v=2026-05-28T00:00:00.000Z');
});

it('omits photoUrl in MeResponse when the user doc has none', async () => {
  fakeFirestore.set('users/u1', { displayName: 'Ada', role: 'STUDENT' });
  const me = await service.getMe('u1' as UserId, { email: 'a@b.com', emailVerified: true });
  expect(me.photoUrl).toBeUndefined();
});
```

(Adjust `fakeFirestore` to whatever the existing spec uses — copy from a passing test in the same file.)

- [ ] **Step 3: Verify failure**

```bash
pnpm nx test api-auth
```

- [ ] **Step 4: Make it pass**

In `libs/api-auth/src/lib/auth.service.ts`, widen the user-doc read shape and copy `photoUrl` into the `MeResponse`:

```ts
async getMe(
  uid: UserId,
  fromCookie: { email: string; emailVerified: boolean },
): Promise<MeResponse> {
  const snap = await this.firestore.collection('users').doc(uid).get();
  if (!snap.exists) {
    this.logger.error(`[auth] getMe missing users/${uid}`);
    throw new InternalAuthException();
  }
  const data = snap.data() as {
    displayName: string;
    role: UserRole;
    photoUrl?: string;       // NEW
  };
  return {
    uid,
    email: fromCookie.email,
    displayName: data.displayName,
    role: data.role,
    ...(data.photoUrl ? { photoUrl: data.photoUrl } : {}),    // NEW
    emailVerified: fromCookie.emailVerified,
  };
}
```

> The conditional spread keeps `photoUrl` *absent* on `MeResponse` (rather than `undefined`) when the user has no picture — matches the optional-field convention.

- [ ] **Step 5: Run tests; verify pass**

```bash
pnpm nx test api-auth
```

- [ ] **Step 6: Commit**

```bash
git add libs/api-auth/src/lib/auth.service.ts libs/api-auth/src/lib/auth.service.spec.ts
git commit -m "feat(api-auth): plumb photoUrl through getMe into MeResponse"
```

---

## Task 6: `ProfileService` plumb `photoUrl` into `ProfileView` + `MeResponse`

**Files:**
- Modify: `libs/api-profile/src/lib/profile.service.ts`
- Test: `libs/api-profile/src/lib/profile.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add two cases:

```ts
it('getProfile returns photoUrl when the user doc carries one', async () => {
  fakeFirestore.set('users/u1', {
    displayName: 'Ada',
    biography: '',
    role: 'STUDENT',
    photoUrl: 'https://example.com/p/u1/avatar.jpg?v=…',
  });
  const view = await service.getProfile('u1' as UserId, { email: 'a@b.com', emailVerified: true });
  expect(view.photoUrl).toContain('avatar.jpg');
});

it('updateProfile returns MeResponse including photoUrl when stored', async () => {
  fakeFirestore.set('users/u1', {
    displayName: 'Ada',
    biography: '',
    role: 'STUDENT',
    photoUrl: 'https://example.com/p/u1/avatar.jpg?v=…',
  });
  const me = await service.updateProfile(
    'u1' as UserId,
    { displayName: 'Ada Lovelace', biography: 'Mathematician.' },
    { email: 'a@b.com', emailVerified: true },
  );
  expect(me.photoUrl).toContain('avatar.jpg');
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test api-profile
```

- [ ] **Step 3: Make it pass**

In `libs/api-profile/src/lib/profile.service.ts`:

```ts
interface UserDoc {
  displayName: string;
  biography?: string;
  photoUrl?: string;        // NEW
  role: UserRole;
}

// In getProfile, after `const data = await this.readUser(uid);` add to the return:
return {
  uid,
  email: fromCookie.email,
  displayName: data.displayName,
  biography: data.biography ?? '',
  ...(data.photoUrl ? { photoUrl: data.photoUrl } : {}),     // NEW
  role: data.role,
  emailVerified: fromCookie.emailVerified,
};

// In updateProfile, the post-update return:
return {
  uid,
  email: fromCookie.email,
  displayName: data.displayName,
  ...(data.photoUrl ? { photoUrl: data.photoUrl } : {}),     // NEW
  role: data.role,
  emailVerified: fromCookie.emailVerified,
};
```

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test api-profile
```

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/profile.service.ts libs/api-profile/src/lib/profile.service.spec.ts
git commit -m "feat(api-profile): plumb photoUrl through ProfileService into ProfileView and MeResponse"
```

---

## Task 7: `picture/errors/` — codes + exception classes

**Files (all under `libs/api-profile/src/lib/picture/errors/`):**
- Create: `picture-error.codes.ts`
- Create: `picture.exception.ts`
- Test: `picture.exception.spec.ts`

Mirror precedent: `libs/api-courses/src/lib/cover/errors/`.

- [ ] **Step 1: Write the failing test**

```ts
// libs/api-profile/src/lib/picture/errors/picture.exception.spec.ts
import {
  PictureDecodeFailedException,
  PictureDimensionsTooSmallException,
  PictureException,
  PictureTooLargeException,
  UnsupportedPictureFormatException,
} from './picture.exception';

describe('PictureException hierarchy', () => {
  it('carries code, message, status, and (optional) details on each subclass', () => {
    const a = new PictureDimensionsTooSmallException({ width: 200, height: 200 });
    expect(a.code).toBe('PROFILE_PICTURE_DIMENSIONS_TOO_SMALL');
    expect(a.status).toBe(400);
    expect(a.details).toEqual({ width: 200, height: 200 });

    const b = new PictureDecodeFailedException();
    expect(b.code).toBe('PROFILE_PICTURE_DECODE_FAILED');
    expect(b.status).toBe(400);

    const c = new PictureTooLargeException();
    expect(c.code).toBe('PROFILE_PICTURE_TOO_LARGE');
    expect(c.status).toBe(413);

    const d = new UnsupportedPictureFormatException();
    expect(d.code).toBe('UNSUPPORTED_PROFILE_PICTURE_FORMAT');
    expect(d.status).toBe(415);
  });

  it('all subclasses are instances of PictureException', () => {
    expect(new PictureDimensionsTooSmallException({ width: 1, height: 1 })).toBeInstanceOf(PictureException);
    expect(new PictureDecodeFailedException()).toBeInstanceOf(PictureException);
    expect(new PictureTooLargeException()).toBeInstanceOf(PictureException);
    expect(new UnsupportedPictureFormatException()).toBeInstanceOf(PictureException);
  });
});
```

- [ ] **Step 2: Verify failure (files don't exist yet)**

```bash
pnpm nx test api-profile
```

- [ ] **Step 3: Make it pass**

```ts
// libs/api-profile/src/lib/picture/errors/picture-error.codes.ts
export const PICTURE_ERROR_CODES = [
  'PROFILE_PICTURE_DIMENSIONS_TOO_SMALL',
  'PROFILE_PICTURE_DECODE_FAILED',
  'PROFILE_PICTURE_TOO_LARGE',
  'UNSUPPORTED_PROFILE_PICTURE_FORMAT',
] as const;

export type PictureErrorCode = (typeof PICTURE_ERROR_CODES)[number];
```

```ts
// libs/api-profile/src/lib/picture/errors/picture.exception.ts
import type { PictureErrorCode } from './picture-error.codes';

export class PictureException extends Error {
  constructor(
    public readonly code: PictureErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PictureException';
  }
}

export class PictureDimensionsTooSmallException extends PictureException {
  constructor(dims: { width: number; height: number }) {
    super(
      'PROFILE_PICTURE_DIMENSIONS_TOO_SMALL',
      'Profile picture must be JPEG or PNG, at least 256x256 pixels.',
      400,
      { width: dims.width, height: dims.height },
    );
  }
}

export class PictureDecodeFailedException extends PictureException {
  constructor() {
    super('PROFILE_PICTURE_DECODE_FAILED', 'Profile picture could not be decoded.', 400);
  }
}

export class PictureTooLargeException extends PictureException {
  constructor() {
    super('PROFILE_PICTURE_TOO_LARGE', 'Profile picture exceeds the 2 MB limit.', 413);
  }
}

export class UnsupportedPictureFormatException extends PictureException {
  constructor() {
    super(
      'UNSUPPORTED_PROFILE_PICTURE_FORMAT',
      'Profile picture must be JPEG or PNG.',
      415,
    );
  }
}
```

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test api-profile
```

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/picture/errors/
git commit -m "feat(api-profile): picture exception hierarchy and error code constants"
```

---

## Task 8: `picture/picture.config.ts`

**Files:**
- Create: `libs/api-profile/src/lib/picture/picture.config.ts`
- Test: `libs/api-profile/src/lib/picture/picture.config.spec.ts`

Mirror precedent: `libs/api-courses/src/lib/cover/cover.config.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { readPictureConfigFromEnv } from './picture.config';

describe('readPictureConfigFromEnv', () => {
  it('reads bucket, publicBaseUrl, defaults impl to fake', () => {
    const cfg = readPictureConfigFromEnv({
      LEARNWREN_PICTURE_BUCKET: 'b',
      LEARNWREN_PICTURE_PUBLIC_BASE_URL: 'https://example.com',
    });
    expect(cfg.bucket).toBe('b');
    expect(cfg.publicBaseUrl).toBe('https://example.com');
    expect(cfg.impl).toBe('fake');
  });

  it('selects firebase when LEARNWREN_PICTURE_STORAGE=firebase', () => {
    const cfg = readPictureConfigFromEnv({
      LEARNWREN_PICTURE_BUCKET: 'b',
      LEARNWREN_PICTURE_PUBLIC_BASE_URL: 'https://example.com',
      LEARNWREN_PICTURE_STORAGE: 'firebase',
    });
    expect(cfg.impl).toBe('firebase');
  });

  it('throws when LEARNWREN_PICTURE_BUCKET is missing', () => {
    expect(() => readPictureConfigFromEnv({ LEARNWREN_PICTURE_PUBLIC_BASE_URL: 'x' })).toThrow();
  });

  it('throws when LEARNWREN_PICTURE_PUBLIC_BASE_URL is missing', () => {
    expect(() => readPictureConfigFromEnv({ LEARNWREN_PICTURE_BUCKET: 'b' })).toThrow();
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test api-profile
```

- [ ] **Step 3: Make it pass**

```ts
// libs/api-profile/src/lib/picture/picture.config.ts
export const PICTURE_CONFIG = Symbol.for('learnwren.api-profile.picture.config');

export type PictureStorageImpl = 'firebase' | 'fake';

export interface PictureConfig {
  bucket: string;
  publicBaseUrl: string;
  impl: PictureStorageImpl;
}

export function readPictureConfigFromEnv(
  env: Record<string, string | undefined>,
): PictureConfig {
  const bucket = env['LEARNWREN_PICTURE_BUCKET'];
  if (!bucket) {
    throw new Error('LEARNWREN_PICTURE_BUCKET is required.');
  }
  const publicBaseUrl = env['LEARNWREN_PICTURE_PUBLIC_BASE_URL'];
  if (!publicBaseUrl) {
    throw new Error('LEARNWREN_PICTURE_PUBLIC_BASE_URL is required.');
  }
  const raw = env['LEARNWREN_PICTURE_STORAGE'];
  const impl: PictureStorageImpl = raw === 'firebase' ? 'firebase' : 'fake';
  return { bucket, publicBaseUrl, impl };
}
```

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test api-profile
```

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/picture/picture.config.ts libs/api-profile/src/lib/picture/picture.config.spec.ts
git commit -m "feat(api-profile): picture storage config (env → bucket + publicBaseUrl + impl)"
```

---

## Task 9: `picture/picture-storage.adapter.ts` (port + Firebase impl)

**Files:**
- Create: `libs/api-profile/src/lib/picture/picture-storage.adapter.ts`
- Test: `libs/api-profile/src/lib/picture/picture-storage.adapter.spec.ts`

Mirror precedent: `libs/api-courses/src/lib/cover/cover-storage.adapter.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { FirebasePictureStorageAdapter, type PictureStoragePort } from './picture-storage.adapter';

describe('FirebasePictureStorageAdapter', () => {
  function makeStub() {
    const calls: Array<{ kind: 'save' | 'delete'; path: string; body?: Buffer; opts?: unknown }> = [];
    const fileApi = (path: string) => ({
      save: async (body: Buffer, opts: unknown) => { calls.push({ kind: 'save', path, body, opts }); },
      delete: async (opts: unknown) => { calls.push({ kind: 'delete', path, opts }); },
    });
    const storage = { bucket: () => ({ file: fileApi }) };
    return { calls, storage };
  }

  it('putObject saves the buffer with the right contentType + cacheControl + custom metadata', async () => {
    const { calls, storage } = makeStub();
    const cfg = { bucket: 'b', publicBaseUrl: 'https://example.com', impl: 'firebase' as const };
    const a: PictureStoragePort = new FirebasePictureStorageAdapter(storage as never, cfg);
    await a.putObject({
      path: 'profile-pictures/u1/avatar.jpg',
      contentType: 'image/jpeg',
      body: Buffer.from('x'),
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { uid: 'u1' },
    });
    expect(calls[0]).toMatchObject({
      kind: 'save',
      path: 'profile-pictures/u1/avatar.jpg',
    });
  });

  it('deleteObject swallows a 404 from Storage', async () => {
    const cfg = { bucket: 'b', publicBaseUrl: 'https://example.com', impl: 'firebase' as const };
    const storage = {
      bucket: () => ({
        file: () => ({
          delete: async () => { const e: { code?: number } = new Error('not found'); e.code = 404; throw e; },
        }),
      }),
    };
    const a = new FirebasePictureStorageAdapter(storage as never, cfg);
    await expect(a.deleteObject({ path: 'profile-pictures/u1/avatar.jpg' })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test api-profile
```

- [ ] **Step 3: Make it pass**

```ts
// libs/api-profile/src/lib/picture/picture-storage.adapter.ts
import { Inject, Injectable } from '@nestjs/common';

import { FIREBASE_STORAGE, type FirebaseStorageHandle } from '@learnwren/api-firebase';

import { PICTURE_CONFIG, type PictureConfig } from './picture.config';

export interface PutObjectInput {
  path: string;
  contentType: string;
  body: Buffer;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface PictureStoragePort {
  putObject(input: PutObjectInput): Promise<void>;
  deleteObject(input: { path: string }): Promise<void>;
}

@Injectable()
export class FirebasePictureStorageAdapter implements PictureStoragePort {
  constructor(
    @Inject(FIREBASE_STORAGE) private readonly storage: FirebaseStorageHandle,
    @Inject(PICTURE_CONFIG) private readonly cfg: PictureConfig,
  ) {}

  async putObject(input: PutObjectInput): Promise<void> {
    const file = this.storage.bucket(this.cfg.bucket).file(input.path);
    await file.save(input.body, {
      contentType: input.contentType,
      metadata: {
        cacheControl: input.cacheControl,
        metadata: input.metadata,
      },
      resumable: false,
    });
  }

  async deleteObject(input: { path: string }): Promise<void> {
    const file = this.storage.bucket(this.cfg.bucket).file(input.path);
    try {
      await file.delete({ ignoreNotFound: true });
    } catch (err) {
      if ((err as { code?: number }).code === 404) return;
      throw err;
    }
  }
}

export const PICTURE_STORAGE = Symbol.for('learnwren.api-profile.picture.storage');
```

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test api-profile
```

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/picture/picture-storage.adapter.ts libs/api-profile/src/lib/picture/picture-storage.adapter.spec.ts
git commit -m "feat(api-profile): picture storage port + Firebase adapter"
```

---

## Task 10: `picture/fake-picture-storage.adapter.ts`

**Files:**
- Create: `libs/api-profile/src/lib/picture/fake-picture-storage.adapter.ts`
- Test: `libs/api-profile/src/lib/picture/fake-picture-storage.adapter.spec.ts`

Mirror precedent: `libs/api-courses/src/lib/cover/fake-cover-storage.adapter.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { FakePictureStorageAdapter } from './fake-picture-storage.adapter';

describe('FakePictureStorageAdapter', () => {
  it('putObject stores under the path; has() reflects it; get() returns the blob', async () => {
    const a = new FakePictureStorageAdapter();
    await a.putObject({
      path: 'profile-pictures/u1/avatar.jpg',
      contentType: 'image/jpeg',
      body: Buffer.from('hello'),
      cacheControl: 'public',
      metadata: { uid: 'u1' },
    });
    expect(a.has('profile-pictures/u1/avatar.jpg')).toBe(true);
    expect(a.get('profile-pictures/u1/avatar.jpg')?.contentType).toBe('image/jpeg');
  });

  it('deleteObject removes the blob; deleting a missing path is a no-op', async () => {
    const a = new FakePictureStorageAdapter();
    await a.putObject({ path: 'p', contentType: 'image/jpeg', body: Buffer.from('x') });
    await a.deleteObject({ path: 'p' });
    expect(a.has('p')).toBe(false);
    await expect(a.deleteObject({ path: 'p' })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test api-profile
```

- [ ] **Step 3: Make it pass**

```ts
// libs/api-profile/src/lib/picture/fake-picture-storage.adapter.ts
import { Injectable } from '@nestjs/common';

import type { PictureStoragePort, PutObjectInput } from './picture-storage.adapter';

interface StoredBlob {
  contentType: string;
  body: Buffer;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class FakePictureStorageAdapter implements PictureStoragePort {
  private readonly blobs = new Map<string, StoredBlob>();

  async putObject(input: PutObjectInput): Promise<void> {
    this.blobs.set(input.path, {
      contentType: input.contentType,
      body: Buffer.from(input.body),
      cacheControl: input.cacheControl,
      metadata: input.metadata,
    });
  }

  async deleteObject(input: { path: string }): Promise<void> {
    this.blobs.delete(input.path);
  }

  // Test helpers — not part of the port.
  has(path: string): boolean { return this.blobs.has(path); }
  get(path: string): StoredBlob | undefined { return this.blobs.get(path); }
  clear(): void { this.blobs.clear(); }
}
```

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test api-profile
```

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/picture/fake-picture-storage.adapter.ts libs/api-profile/src/lib/picture/fake-picture-storage.adapter.spec.ts
git commit -m "feat(api-profile): in-memory FakePictureStorageAdapter for tests + local"
```

---

## Task 11: `picture/profile-picture.service.ts` — sharp pipeline + user patch

**Files:**
- Create: `libs/api-profile/src/lib/picture/profile-picture.service.ts`
- Test: `libs/api-profile/src/lib/picture/profile-picture.service.spec.ts`

Mirror precedent: `libs/api-courses/src/lib/cover/cover-image.service.ts`. **Differences from cover:** validates `min(width,height) ≥ 256` (not 1280×720); centre-crops to a square before downscaling to 512×512; reads/writes the **`users/{uid}`** doc (not `courses/{cid}`); writes `User.photoUrl` (not `Course.coverImageUrl`); builds a `MeResponse` to return (not `{coverImageUrl, updatedAt}`).

- [ ] **Step 1: Write the failing tests**

```ts
// libs/api-profile/src/lib/picture/profile-picture.service.spec.ts
import sharp from 'sharp';
import { FakePictureStorageAdapter } from './fake-picture-storage.adapter';
import {
  PictureDecodeFailedException,
  PictureDimensionsTooSmallException,
} from './errors/picture.exception';
import { ProfilePictureService } from './profile-picture.service';

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } },
  })
    .jpeg()
    .toBuffer();
}

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

interface FakeFirestoreDoc {
  set: (data: Record<string, unknown>) => void;
  update: (data: Record<string, unknown>) => Promise<void>;
  get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
}

function makeFakeFirestore() {
  const store = new Map<string, Record<string, unknown>>();
  return {
    store,
    collection(name: string) {
      return {
        doc(id: string) {
          const key = `${name}/${id}`;
          const d: FakeFirestoreDoc = {
            set: (data) => { store.set(key, data); },
            update: async (data) => {
              const prev = store.get(key) ?? {};
              const filtered: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(data)) if (v !== undefined) filtered[k] = v;
              store.set(key, { ...prev, ...filtered });
            },
            get: async () => {
              const data = store.get(key);
              return { exists: !!data, data: () => data };
            },
          };
          return d;
        },
      };
    },
  };
}

describe('ProfilePictureService', () => {
  const cfg = { bucket: 'b', publicBaseUrl: 'https://example.com', impl: 'fake' as const };
  let storage: FakePictureStorageAdapter;
  let firestore: ReturnType<typeof makeFakeFirestore>;
  let service: ProfilePictureService;

  beforeEach(() => {
    storage = new FakePictureStorageAdapter();
    firestore = makeFakeFirestore();
    firestore.store.set('users/u1', { displayName: 'Ada', biography: '', role: 'STUDENT' });
    service = new ProfilePictureService(storage, firestore as never, cfg);
  });

  it('happy path: 256x256 JPEG → stores a 512x512 JPEG and returns MeResponse with photoUrl', async () => {
    const me = await service.uploadPicture(
      'u1' as never,
      await jpeg(256, 256),
      'image/jpeg',
      { email: 'a@b.com', emailVerified: true },
    );
    expect(me.photoUrl).toMatch(/^https:\/\/example\.com\/profile-pictures\/u1\/avatar\.jpg\?v=/);
    expect(storage.has('profile-pictures/u1/avatar.jpg')).toBe(true);
    const blob = storage.get('profile-pictures/u1/avatar.jpg')!;
    expect(blob.contentType).toBe('image/jpeg');
    expect(blob.cacheControl).toBe('public, max-age=31536000, immutable');
    expect(blob.metadata).toEqual({ uid: 'u1' });
    const meta = await sharp(blob.body).metadata();
    expect(meta.width).toBe(256);    // 256x256 input is not upscaled
    expect(meta.height).toBe(256);
    expect(meta.format).toBe('jpeg');
  });

  it('1024x768 JPEG → centre-cropped to square (768x768) then downscaled to 512x512', async () => {
    await service.uploadPicture(
      'u1' as never,
      await jpeg(1024, 768),
      'image/jpeg',
      { email: 'a@b.com', emailVerified: true },
    );
    const blob = storage.get('profile-pictures/u1/avatar.jpg')!;
    const meta = await sharp(blob.body).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });

  it('200x800 PNG → PictureDimensionsTooSmallException with the actual dims', async () => {
    await expect(
      service.uploadPicture('u1' as never, await png(200, 800), 'image/png', { email: 'a@b.com', emailVerified: true }),
    ).rejects.toMatchObject({
      code: 'PROFILE_PICTURE_DIMENSIONS_TOO_SMALL',
      details: { width: 200, height: 800 },
    });
  });

  it('corrupt buffer → PictureDecodeFailedException', async () => {
    await expect(
      service.uploadPicture('u1' as never, Buffer.from('not an image'), 'image/jpeg', { email: 'a@b.com', emailVerified: true }),
    ).rejects.toBeInstanceOf(PictureDecodeFailedException);
  });

  it('writes photoUrl and updatedAt onto the user doc with the same ?v= timestamp', async () => {
    const me = await service.uploadPicture(
      'u1' as never,
      await jpeg(256, 256),
      'image/jpeg',
      { email: 'a@b.com', emailVerified: true },
    );
    const doc = firestore.store.get('users/u1') as Record<string, unknown>;
    expect(doc['photoUrl']).toBe(me.photoUrl);
    expect(typeof doc['updatedAt']).toBe('string');
    expect(me.photoUrl).toContain(encodeURIComponent(doc['updatedAt'] as string));
  });

  it('removePicture deletes the blob, unsets photoUrl, bumps updatedAt, returns MeResponse without photoUrl', async () => {
    await service.uploadPicture('u1' as never, await jpeg(256, 256), 'image/jpeg', { email: 'a@b.com', emailVerified: true });
    const me = await service.removePicture('u1' as never, { email: 'a@b.com', emailVerified: true });
    expect(me.photoUrl).toBeUndefined();
    expect(storage.has('profile-pictures/u1/avatar.jpg')).toBe(false);
    const doc = firestore.store.get('users/u1') as Record<string, unknown>;
    expect(doc['photoUrl']).toBeUndefined();
  });
});
```

> The `firestore.update` fake mirrors a Firestore Admin quirk recorded in memory (`project_cover_image_upload.md`): `.update()` strips `undefined` keys, so unsetting a field needs the `FieldValue.delete()` sentinel. We handle that in the service (Step 3).

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test api-profile
```

- [ ] **Step 3: Make it pass**

```ts
// libs/api-profile/src/lib/picture/profile-picture.service.ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type { MeResponse, UserId, UserRole } from '@learnwren/shared-data-models';
import { FieldValue } from 'firebase-admin/firestore';

import {
  PictureDecodeFailedException,
  PictureDimensionsTooSmallException,
} from './errors/picture.exception';
import { PICTURE_CONFIG, type PictureConfig } from './picture.config';
import { PICTURE_STORAGE, type PictureStoragePort } from './picture-storage.adapter';

const MIN_SIDE = 256;
const TARGET_SIDE = 512;

interface UserDoc {
  displayName: string;
  role: UserRole;
  photoUrl?: string;
}

@Injectable()
export class ProfilePictureService {
  constructor(
    @Inject(PICTURE_STORAGE) private readonly storage: PictureStoragePort,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    @Inject(PICTURE_CONFIG) private readonly cfg: PictureConfig,
  ) {}

  async uploadPicture(
    uid: UserId,
    body: Buffer,
    _contentType: 'image/jpeg' | 'image/png',
    fromCookie: { email: string; emailVerified: boolean },
  ): Promise<MeResponse> {
    let meta: sharp.Metadata;
    try {
      meta = await sharp(body, { failOn: 'truncated' }).metadata();
    } catch {
      throw new PictureDecodeFailedException();
    }
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) throw new PictureDecodeFailedException();
    const minSide = Math.min(width, height);
    if (minSide < MIN_SIDE) {
      throw new PictureDimensionsTooSmallException({ width, height });
    }

    const jpeg = await sharp(body, { failOn: 'truncated' })
      .resize(minSide, minSide, { fit: 'cover', position: 'centre' })
      .resize(TARGET_SIDE, TARGET_SIDE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    const path = `profile-pictures/${uid}/avatar.jpg`;
    await this.storage.putObject({
      path,
      contentType: 'image/jpeg',
      body: jpeg,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { uid: String(uid) },
    });

    const updatedAt = new Date().toISOString();
    const photoUrl = `${this.cfg.publicBaseUrl}/${path}?v=${encodeURIComponent(updatedAt)}`;
    await this.firestore.collection('users').doc(uid).update({
      photoUrl,
      updatedAt,
    });
    return this.buildMe(uid, fromCookie);
  }

  async removePicture(
    uid: UserId,
    fromCookie: { email: string; emailVerified: boolean },
  ): Promise<MeResponse> {
    const path = `profile-pictures/${uid}/avatar.jpg`;
    await this.storage.deleteObject({ path });
    const updatedAt = new Date().toISOString();
    await this.firestore.collection('users').doc(uid).update({
      photoUrl: FieldValue.delete(),
      updatedAt,
    });
    return this.buildMe(uid, fromCookie);
  }

  private async buildMe(
    uid: UserId,
    fromCookie: { email: string; emailVerified: boolean },
  ): Promise<MeResponse> {
    const snap = await this.firestore.collection('users').doc(uid).get();
    if (!snap.exists) throw new NotFoundException('User profile not found.');
    const data = snap.data() as UserDoc;
    return {
      uid,
      email: fromCookie.email,
      displayName: data.displayName,
      role: data.role,
      ...(data.photoUrl ? { photoUrl: data.photoUrl } : {}),
      emailVerified: fromCookie.emailVerified,
    };
  }
}
```

> **Note on the test fake:** The test's `FakeFirestoreDoc.update` strips `undefined`, which is faithful to the real Admin SDK. To make `removePicture` work in the test, the fake needs to honour `FieldValue.delete()` as "unset this key". Either extend the fake's `update` to detect that sentinel and `delete prev[key]`, or replace the `firebase-admin/firestore` import in the spec with a tiny `FieldValue = { delete: () => DELETE_SENTINEL }` stub and check for that sentinel in the fake. Pick the lighter-weight option when writing the test.

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test api-profile
```

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/picture/profile-picture.service.ts libs/api-profile/src/lib/picture/profile-picture.service.spec.ts
git commit -m "feat(api-profile): profile picture sharp pipeline + storage + user patch"
```

---

## Task 12: `picture/picture.exception-filter.ts`

**Files:**
- Create: `libs/api-profile/src/lib/picture/picture.exception-filter.ts`
- Test: `libs/api-profile/src/lib/picture/picture.exception-filter.spec.ts`

Mirror precedent: `libs/api-courses/src/lib/cover/cover.exception-filter.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// libs/api-profile/src/lib/picture/picture.exception-filter.spec.ts
import { ArgumentsHost, HttpException } from '@nestjs/common';
import {
  PictureDecodeFailedException,
  PictureDimensionsTooSmallException,
  PictureTooLargeException,
  UnsupportedPictureFormatException,
} from './errors/picture.exception';
import { PictureExceptionFilter } from './picture.exception-filter';

function makeHost(): { host: ArgumentsHost; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('PictureExceptionFilter', () => {
  it('maps PictureDimensionsTooSmallException → 400 with code + details', () => {
    const { host, status, json } = makeHost();
    new PictureExceptionFilter().catch(
      new PictureDimensionsTooSmallException({ width: 200, height: 800 }),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'PROFILE_PICTURE_DIMENSIONS_TOO_SMALL',
        message: expect.any(String),
        details: { width: 200, height: 800 },
      },
    });
  });

  it('maps PictureDecodeFailedException → 400', () => {
    const { host, status, json } = makeHost();
    new PictureExceptionFilter().catch(new PictureDecodeFailedException(), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0].error.code).toBe('PROFILE_PICTURE_DECODE_FAILED');
  });

  it('maps PictureTooLargeException → 413', () => {
    const { host, status, json } = makeHost();
    new PictureExceptionFilter().catch(new PictureTooLargeException(), host);
    expect(status).toHaveBeenCalledWith(413);
    expect(json.mock.calls[0][0].error.code).toBe('PROFILE_PICTURE_TOO_LARGE');
  });

  it('maps UnsupportedPictureFormatException → 415', () => {
    const { host, status, json } = makeHost();
    new PictureExceptionFilter().catch(new UnsupportedPictureFormatException(), host);
    expect(status).toHaveBeenCalledWith(415);
    expect(json.mock.calls[0][0].error.code).toBe('UNSUPPORTED_PROFILE_PICTURE_FORMAT');
  });

  it('falls back to 500 INTERNAL for unknown exceptions', () => {
    const { host, status, json } = makeHost();
    new PictureExceptionFilter().catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json.mock.calls[0][0].error.code).toBe('INTERNAL');
  });

  it('maps a generic HttpException (e.g. 401 from guards) through the status table', () => {
    const { host, status, json } = makeHost();
    new PictureExceptionFilter().catch(new HttpException('nope', 401), host);
    expect(status).toHaveBeenCalledWith(401);
    expect(json.mock.calls[0][0].error.code).toBe('UNAUTHORIZED');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test api-profile
```

- [ ] **Step 3: Make it pass**

```ts
// libs/api-profile/src/lib/picture/picture.exception-filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { PictureException } from './errors/picture.exception';

interface PictureErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch(PictureException, HttpException)
export class PictureExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('PictureExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof PictureException) {
      response.status(exception.status).json({
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      } satisfies PictureErrorBody);
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: { code: codeForStatus(status), message: exception.message },
      } satisfies PictureErrorBody);
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    } satisfies PictureErrorBody);
  }
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 413: return 'PAYLOAD_TOO_LARGE';
    case 415: return 'UNSUPPORTED_MEDIA_TYPE';
    default: return 'ERROR';
  }
}
```

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test api-profile
```

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/picture/picture.exception-filter.ts libs/api-profile/src/lib/picture/picture.exception-filter.spec.ts
git commit -m "feat(api-profile): picture exception filter (per-feature mapping)"
```

---

## Task 13: `picture/profile-picture.controller.ts`

**Files:**
- Create: `libs/api-profile/src/lib/picture/profile-picture.controller.ts`
- Test: `libs/api-profile/src/lib/picture/profile-picture.controller.spec.ts`

Mirror precedent: `libs/api-courses/src/lib/cover/cover.controller.ts`. **Differences:** routes are `profile/picture` (no `:cid`), only `FirebaseSessionGuard` (no `CourseOwnerGuard`), both endpoints return `MeResponse`, DELETE returns `200` (not `204`).

- [ ] **Step 1: Write the failing test**

```ts
// libs/api-profile/src/lib/picture/profile-picture.controller.spec.ts
import { ProfilePictureController } from './profile-picture.controller';
import {
  PictureTooLargeException,
  UnsupportedPictureFormatException,
} from './errors/picture.exception';
import type { MeResponse } from '@learnwren/shared-data-models';

function meStub(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    uid: 'u1' as MeResponse['uid'],
    email: 'a@b.com',
    displayName: 'Ada',
    role: 'STUDENT',
    emailVerified: true,
    photoUrl: 'https://example.com/profile-pictures/u1/avatar.jpg?v=…',
    ...overrides,
  };
}

describe('ProfilePictureController', () => {
  const req: { user: { uid: 'u1'; email: 'a@b.com'; emailVerified: true } } = {
    user: { uid: 'u1', email: 'a@b.com', emailVerified: true },
  };

  it('PUT returns the MeResponse from the service', async () => {
    const svc = { uploadPicture: jest.fn().mockResolvedValue(meStub()) } as never;
    const c = new ProfilePictureController(svc);
    const file = { buffer: Buffer.from('x'), mimetype: 'image/jpeg', size: 1024 } as Express.Multer.File;
    const me = await c.upload(file, req as never);
    expect(me.photoUrl).toContain('avatar.jpg');
    expect(svc.uploadPicture).toHaveBeenCalledWith('u1', file.buffer, 'image/jpeg', {
      email: 'a@b.com',
      emailVerified: true,
    });
  });

  it('PUT with no file → UnsupportedPictureFormatException', async () => {
    const svc = {} as never;
    const c = new ProfilePictureController(svc);
    await expect(c.upload(undefined as never, req as never)).rejects.toBeInstanceOf(UnsupportedPictureFormatException);
  });

  it('PUT with non-JPEG/PNG mime → UnsupportedPictureFormatException', async () => {
    const svc = {} as never;
    const c = new ProfilePictureController(svc);
    const file = { buffer: Buffer.from('x'), mimetype: 'image/gif', size: 1 } as Express.Multer.File;
    await expect(c.upload(file, req as never)).rejects.toBeInstanceOf(UnsupportedPictureFormatException);
  });

  it('PUT with body > 2 MB → PictureTooLargeException', async () => {
    const svc = {} as never;
    const c = new ProfilePictureController(svc);
    const file = { buffer: Buffer.from('x'), mimetype: 'image/jpeg', size: 3_000_000 } as Express.Multer.File;
    await expect(c.upload(file, req as never)).rejects.toBeInstanceOf(PictureTooLargeException);
  });

  it('DELETE returns MeResponse (without photoUrl)', async () => {
    const svc = { removePicture: jest.fn().mockResolvedValue(meStub({ photoUrl: undefined })) } as never;
    const c = new ProfilePictureController(svc);
    const me = await c.remove(req as never);
    expect(me.photoUrl).toBeUndefined();
    expect(svc.removePicture).toHaveBeenCalledWith('u1', { email: 'a@b.com', emailVerified: true });
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test api-profile
```

- [ ] **Step 3: Make it pass**

```ts
// libs/api-profile/src/lib/picture/profile-picture.controller.ts
import {
  Controller,
  Delete,
  Put,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { FirebaseSessionGuard, type AuthenticatedRequest } from '@learnwren/api-auth';
import type { MeResponse } from '@learnwren/shared-data-models';

import {
  PictureTooLargeException,
  UnsupportedPictureFormatException,
} from './errors/picture.exception';
import { PictureExceptionFilter } from './picture.exception-filter';
import { ProfilePictureService } from './profile-picture.service';

const MAX_BYTES = 2_000_000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);

@Controller('profile')
@UseFilters(PictureExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class ProfilePictureController {
  constructor(private readonly svc: ProfilePictureService) {}

  @Put('picture')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BYTES },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ): Promise<MeResponse> {
    if (!file) throw new UnsupportedPictureFormatException();
    if (!ALLOWED_MIME.has(file.mimetype)) throw new UnsupportedPictureFormatException();
    if (file.size > MAX_BYTES) throw new PictureTooLargeException();
    const user = req.user!;
    return this.svc.uploadPicture(
      user.uid,
      file.buffer,
      file.mimetype as 'image/jpeg' | 'image/png',
      { email: user.email, emailVerified: user.emailVerified },
    );
  }

  @Delete('picture')
  async remove(@Req() req: AuthenticatedRequest): Promise<MeResponse> {
    const user = req.user!;
    return this.svc.removePicture(user.uid, {
      email: user.email,
      emailVerified: user.emailVerified,
    });
  }
}
```

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test api-profile
```

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/picture/profile-picture.controller.ts libs/api-profile/src/lib/picture/profile-picture.controller.spec.ts
git commit -m "feat(api-profile): profile picture controller (PUT/DELETE /api/profile/picture)"
```

---

## Task 14: Register picture providers in `ProfileModule` + bootstrap config in apps/api

**Files:**
- Modify: `libs/api-profile/src/lib/profile.module.ts`
- Modify: `apps/api/src/app/app.module.ts` (or wherever `ProfileModule` is currently bootstrapped — `grep -rn "ProfileModule" apps/api/src` to locate)

- [ ] **Step 1: Locate the existing wiring**

```bash
grep -rn "ProfileModule\|COVER_CONFIG\|COVER_STORAGE" apps/api/src | head -20
```

Note how the cover slice wires `COVER_CONFIG` and `COVER_STORAGE` providers — copy that shape.

- [ ] **Step 2: Update `ProfileModule`**

```ts
// libs/api-profile/src/lib/profile.module.ts
import { Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';

import { ProfileController } from './profile.controller';
import { ProfileExceptionFilter } from './profile.exception-filter';
import { ProfileService } from './profile.service';
import { ProfilePictureController } from './picture/profile-picture.controller';
import { ProfilePictureService } from './picture/profile-picture.service';
import { PictureExceptionFilter } from './picture/picture.exception-filter';

@Module({
  imports: [AuthModule],
  controllers: [ProfileController, ProfilePictureController],
  providers: [
    ProfileService,
    ProfileExceptionFilter,
    ProfilePictureService,
    PictureExceptionFilter,
  ],
})
export class ProfileModule {}
```

Note that `PICTURE_CONFIG` and `PICTURE_STORAGE` providers are wired **at the app boundary** (not inside `ProfileModule`) so the production bootstrap can decide `firebase` vs `fake` based on env. The cover slice did the same.

- [ ] **Step 3: Wire `PICTURE_CONFIG` + `PICTURE_STORAGE` in apps/api**

Find where the cover slice declared its providers — typically in `apps/api/src/app/app.module.ts` or a small `cover.providers.ts`. Add a sibling block:

```ts
// apps/api/src/app/app.module.ts (or sibling providers file)
import {
  PICTURE_CONFIG,
  PICTURE_STORAGE,
  readPictureConfigFromEnv,
  FirebasePictureStorageAdapter,
  FakePictureStorageAdapter,
} from '@learnwren/api-profile';   // (re-exported in Step 5)

// In the providers array:
{
  provide: PICTURE_CONFIG,
  useFactory: () => readPictureConfigFromEnv(process.env),
},
{
  provide: PICTURE_STORAGE,
  useFactory: (cfg) =>
    cfg.impl === 'firebase' ? new FirebasePictureStorageAdapter(...) : new FakePictureStorageAdapter(),
  inject: [PICTURE_CONFIG /* + FIREBASE_STORAGE if firebase */],
},
```

Mirror exactly how `COVER_STORAGE` is wired today; copy that block and adjust names.

- [ ] **Step 4: Re-export the new picture API from `libs/api-profile/src/index.ts`**

```ts
// libs/api-profile/src/index.ts (append)
export * from './lib/picture/picture.config';
export * from './lib/picture/picture-storage.adapter';
export * from './lib/picture/fake-picture-storage.adapter';
```

- [ ] **Step 5: Verify the api app builds and starts (smoke)**

```bash
pnpm nx test api-profile
pnpm nx build api
```

Expected: both green. The `api` build proves the wiring compiles end-to-end.

- [ ] **Step 6: Commit**

```bash
git add libs/api-profile/src/lib/profile.module.ts \
        libs/api-profile/src/index.ts \
        apps/api/src/app/app.module.ts
git commit -m "feat(api): wire picture providers + module registration"
```

---

## Task 15: Widen `InstructorDirectory` → `instructorRefsFor`

**Files:**
- Modify: `libs/api-courses/src/lib/catalog/instructor-directory.ts`
- Test: `libs/api-courses/src/lib/catalog/instructor-directory.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to the existing spec:

```ts
import type { User } from '@learnwren/shared-data-models';

describe('InstructorDirectory.instructorRefsFor', () => {
  it('returns photoUrl and biography when present on the user doc', async () => {
    fakeFirestore.set('users/u1', {
      displayName: 'Ada',
      role: 'STUDENT',
      photoUrl: 'https://example.com/p/u1/avatar.jpg?v=…',
      biography: 'Mathematician.',
    } satisfies Partial<User>);
    const refs = await directory.instructorRefsFor(['u1'] as never);
    expect(refs.get('u1' as never)).toEqual({
      displayName: 'Ada',
      photoUrl: 'https://example.com/p/u1/avatar.jpg?v=…',
      biography: 'Mathematician.',
    });
  });

  it('omits photoUrl and biography when absent', async () => {
    fakeFirestore.set('users/u1', { displayName: 'Ada', role: 'STUDENT' } satisfies Partial<User>);
    const refs = await directory.instructorRefsFor(['u1'] as never);
    expect(refs.get('u1' as never)).toEqual({ displayName: 'Ada' });
  });

  it('returns fallback ref for unknown ids', async () => {
    const refs = await directory.instructorRefsFor(['u-ghost'] as never);
    expect(refs.get('u-ghost' as never)).toEqual({ displayName: 'Instructor' });
  });

  it('dedupes ids — N copies of the same id = one read', async () => {
    let reads = 0;
    // adjust the existing fake to count reads; copy whatever harness the file already has
    // ...
    await directory.instructorRefsFor(['u1', 'u1', 'u1'] as never);
    expect(reads).toBe(1);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test api-courses
```

- [ ] **Step 3: Make it pass**

```ts
// libs/api-courses/src/lib/catalog/instructor-directory.ts
import { Inject, Injectable } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type { User, UserId } from '@learnwren/shared-data-models';

const USERS = 'users';
const FALLBACK_NAME = 'Instructor';

export interface InstructorRef {
  displayName: string;
  photoUrl?: string;
  biography?: string;
}

@Injectable()
export class InstructorDirectory {
  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  /**
   * Resolve a display name + optional photo URL + optional biography for each id.
   * Deduplicates ids and reads `users/{uid}` documents in parallel.
   */
  async instructorRefsFor(uids: UserId[]): Promise<Map<UserId, InstructorRef>> {
    const unique = [...new Set(uids)];
    const entries = await Promise.all(
      unique.map(async (uid): Promise<[UserId, InstructorRef]> => {
        const snap = await this.firestore.collection(USERS).doc(uid).get();
        const data = snap.exists ? (snap.data() as User) : undefined;
        const ref: InstructorRef = { displayName: data?.displayName ?? FALLBACK_NAME };
        if (data?.photoUrl) ref.photoUrl = data.photoUrl;
        if (data?.biography) ref.biography = data.biography;
        return [uid, ref];
      }),
    );
    return new Map(entries);
  }

  /** @deprecated Prefer `instructorRefsFor`. Retained as a thin shim for now. */
  async displayNamesFor(uids: UserId[]): Promise<Map<UserId, string>> {
    const refs = await this.instructorRefsFor(uids);
    return new Map([...refs].map(([uid, ref]) => [uid, ref.displayName]));
  }
}
```

> Keeping `displayNamesFor` as a deprecated shim avoids touching every caller in this commit; the next task migrates `catalog.service.ts` to the new method.

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test api-courses
```

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/catalog/instructor-directory.ts libs/api-courses/src/lib/catalog/instructor-directory.spec.ts
git commit -m "feat(api-courses): widen InstructorDirectory to instructorRefsFor with photoUrl + biography"
```

---

## Task 16: `catalog.service.ts` thread instructor fields into projections

**Files:**
- Modify: `libs/api-courses/src/lib/catalog/catalog.service.ts:60-93, 100-152`
- Test: `libs/api-courses/src/lib/catalog/catalog.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('CatalogService — instructor avatar projection', () => {
  it('paginate includes instructorId and instructorPhotoUrl on each summary', async () => {
    // seed: one course by u1 (with photoUrl), one by u2 (without)
    // ...
    const page = await svc.getCatalogPage({ page: 1 });
    expect(page.items[0]?.instructorId).toBe('u1');
    expect(page.items[0]?.instructorPhotoUrl).toBe('https://example.com/p/u1/avatar.jpg?v=…');
    expect(page.items[1]?.instructorPhotoUrl).toBeUndefined();
  });

  it('dedupes instructor reads across N courses on a page', async () => {
    // seed: 3 courses, all by u1 — assert the user-doc read counter saw exactly 1 read
    // ...
  });

  it('getCourseDetail includes instructorId, instructorPhotoUrl, instructorBiography', async () => {
    // seed users/u1 with displayName, photoUrl, biography 'Mathematician.'
    // ...
    const detail = await svc.getCourseDetail('c1' as never);
    expect(detail.instructorId).toBe('u1');
    expect(detail.instructorPhotoUrl).toBe('https://example.com/p/u1/avatar.jpg?v=…');
    expect(detail.instructorBiography).toBe('Mathematician.');
  });

  it('getCourseDetail normalises empty/absent biography to undefined', async () => {
    // seed users/u1 with biography: '' — assert undefined out
    // ...
    const detail = await svc.getCourseDetail('c1' as never);
    expect(detail.instructorBiography).toBeUndefined();
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test api-courses
```

- [ ] **Step 3: Make it pass**

```ts
// libs/api-courses/src/lib/catalog/catalog.service.ts

async getCourseDetail(cid: CourseId): Promise<CourseCatalogDetail> {
  const course = await this.repo.getCourse(cid);
  if (!course || course.status !== 'PUBLISHED') {
    throw new CourseNotFoundException();
  }
  const modules = await this.repo.listModulesByCourse(cid);
  const outline = await Promise.all(
    modules.map(async (m) => ({
      title: m.title,
      lessons: (await this.repo.listLessonsByModule(cid, m.id)).map((l) => ({
        id: l.id,
        title: l.title,
      })),
    })),
  );
  const lessonCount = outline.reduce((n, m) => n + m.lessons.length, 0);
  const refs = await this.instructors.instructorRefsFor([course.instructorId]);
  const ref = refs.get(course.instructorId);
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    longDescription: course.longDescription,
    category: course.category,
    difficulty: course.difficulty,
    instructorId: course.instructorId,
    instructorDisplayName: ref?.displayName ?? 'Instructor',
    ...(ref?.photoUrl ? { instructorPhotoUrl: ref.photoUrl } : {}),
    ...(ref?.biography ? { instructorBiography: ref.biography } : {}),
    lessonCount,
    modules: outline,
    publishedAt: publishedAt(course),
    coverImageUrl: course.coverImageUrl,
  };
}

private async paginate(courses: Course[], page: number): Promise<CourseCatalogPage> {
  const total = courses.length;
  const totalPages = Math.ceil(total / CATALOG_PAGE_SIZE);
  const start = (page - 1) * CATALOG_PAGE_SIZE;
  const slice = courses.slice(start, start + CATALOG_PAGE_SIZE);
  const refs = await this.instructors.instructorRefsFor(slice.map((c) => c.instructorId));
  return {
    items: slice.map((c) => toSummary(c, refs)),
    page,
    pageSize: CATALOG_PAGE_SIZE,
    total,
    totalPages,
  };
}

function toSummary(course: Course, refs: Map<UserId, InstructorRef>): CourseSummary {
  const ref = refs.get(course.instructorId);
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    category: course.category,
    difficulty: course.difficulty,
    instructorId: course.instructorId,
    instructorDisplayName: ref?.displayName ?? 'Instructor',
    ...(ref?.photoUrl ? { instructorPhotoUrl: ref.photoUrl } : {}),
    publishedAt: publishedAt(course),
    coverImageUrl: course.coverImageUrl,
  };
}
```

> Import `InstructorRef` from `./instructor-directory`. The `displayNamesFor` calls in this file are replaced by `instructorRefsFor`; the shim added in Task 15 stays for any callers outside `catalog/`.

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test api-courses
pnpm nx test web-catalog       # catches if the new required fields break card/detail specs
```

If `web-catalog` specs fail because the test fixtures lack `instructorId`, add it to the fixtures in the same commit — they're harmless additions.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/catalog/catalog.service.ts \
        libs/api-courses/src/lib/catalog/catalog.service.spec.ts \
        libs/web-catalog/src/lib/**/*.spec.ts
git commit -m "feat(api-courses): catalog projection plumbs instructor photoUrl + biography"
```

---

## Task 17: `storage.rules` — open `profile-pictures/**` for public read

**Files:**
- Modify: `storage.rules`

- [ ] **Step 1: Locate the existing cover rule**

```bash
grep -n "course-covers" storage.rules
```

Note the exact rule shape (the cover slice already wired this; copy its form).

- [ ] **Step 2: Add the picture rule**

Add a sibling rule to `storage.rules`:

```
match /profile-pictures/{uid}/{file=**} {
  allow read: if true;
  allow write: if false;
}
```

(Service-account writes via the Admin SDK bypass rules; client writes are blocked.)

- [ ] **Step 3: Verify rules compile**

If the repo has a rules-lint step:

```bash
pnpm firebase emulators:start --only storage 2>&1 | head -10
# (or whichever script verifies storage.rules — check package.json scripts)
```

- [ ] **Step 4: Commit**

```bash
git add storage.rules
git commit -m "feat(storage): allow public read for profile-pictures/**"
```

---

## Task 18: `avatar-tone.ts` — deterministic tone helper

**Files:**
- Create: `libs/web-ui/src/lib/avatar/avatar-tone.ts`
- Test: `libs/web-ui/src/lib/avatar/avatar-tone.spec.ts`

Mirror precedent: `libs/web-ui/src/lib/cover/cover-tone.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// libs/web-ui/src/lib/avatar/avatar-tone.spec.ts
import { avatarToneFor } from './avatar-tone';

describe('avatarToneFor', () => {
  it('returns the same tone for the same id', () => {
    expect(avatarToneFor('u1')).toBe(avatarToneFor('u1'));
  });

  it('returns one of the known avatar tones', () => {
    const valid = ['moss', 'clay', 'bark', 'paper', 'ochre'];
    expect(valid).toContain(avatarToneFor('u1'));
  });

  it('distributes across tones for varied ids', () => {
    const tones = new Set(['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10'].map(avatarToneFor));
    expect(tones.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test web-ui
```

- [ ] **Step 3: Make it pass**

```ts
// libs/web-ui/src/lib/avatar/avatar-tone.ts
export type LwAvatarTone = 'moss' | 'clay' | 'bark' | 'paper' | 'ochre';

const AVATAR_TONES: readonly LwAvatarTone[] = ['moss', 'clay', 'bark', 'paper', 'ochre'];

export function avatarToneFor(id: string): LwAvatarTone {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % AVATAR_TONES.length;
  return AVATAR_TONES[index] ?? 'moss';
}
```

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test web-ui
```

- [ ] **Step 5: Commit**

```bash
git add libs/web-ui/src/lib/avatar/avatar-tone.ts libs/web-ui/src/lib/avatar/avatar-tone.spec.ts
git commit -m "feat(web-ui): avatarToneFor deterministic tone helper"
```

---

## Task 19: `LwAvatarComponent`

**Files:**
- Create: `libs/web-ui/src/lib/avatar/lw-avatar.component.ts`
- Test: `libs/web-ui/src/lib/avatar/lw-avatar.component.spec.ts`
- Modify: `libs/web-ui/src/index.ts` (re-exports)

Mirror precedent: `libs/web-ui/src/lib/cover/lw-cover.component.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// libs/web-ui/src/lib/avatar/lw-avatar.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { LwAvatarComponent } from './lw-avatar.component';

function render(props: Partial<{ photoUrl: string; displayName: string; userId: string; size: 'sm' | 'md' | 'lg'; alt: string }>) {
  const fixture = TestBed.createComponent(LwAvatarComponent);
  fixture.componentRef.setInput('displayName', props.displayName ?? 'Ada Lovelace');
  fixture.componentRef.setInput('userId', props.userId ?? 'u1');
  if (props.photoUrl !== undefined) fixture.componentRef.setInput('photoUrl', props.photoUrl);
  if (props.size !== undefined) fixture.componentRef.setInput('size', props.size);
  if (props.alt !== undefined) fixture.componentRef.setInput('alt', props.alt);
  fixture.detectChanges();
  return fixture;
}

describe('LwAvatarComponent', () => {
  it('renders <img> with loading=lazy when photoUrl is set', () => {
    const f = render({ photoUrl: 'https://example.com/p/u1/avatar.jpg?v=…' });
    const img: HTMLImageElement | null = f.nativeElement.querySelector('img.lw-avatar-image');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('loading')).toBe('lazy');
  });

  it('alt falls back to displayName when alt input is empty', () => {
    const f = render({ photoUrl: 'https://example.com/x.jpg', displayName: 'Ada Lovelace' });
    const img: HTMLImageElement = f.nativeElement.querySelector('img.lw-avatar-image');
    expect(img.alt).toBe('Ada Lovelace');
  });

  it('renders initials when photoUrl is unset', () => {
    const f = render({ displayName: 'Ada Lovelace' });
    const span = f.nativeElement.querySelector('span.lw-avatar-initials');
    expect(span?.textContent?.trim()).toBe('AL');
  });

  it('single-word displayName → first two letters of that word', () => {
    const f = render({ displayName: 'Ada' });
    expect(f.nativeElement.querySelector('span.lw-avatar-initials')?.textContent?.trim()).toBe('AD');
  });

  it('attaches a deterministic tone data attribute keyed off userId', () => {
    const a = render({ userId: 'u1' });
    const b = render({ userId: 'u1' });
    expect(a.nativeElement.firstElementChild?.getAttribute('data-tone')).toBe(
      b.nativeElement.firstElementChild?.getAttribute('data-tone'),
    );
  });

  it('applies size class for sm/md/lg', () => {
    const sm = render({ size: 'sm' });
    expect(sm.nativeElement.firstElementChild?.getAttribute('data-size')).toBe('sm');
    const lg = render({ size: 'lg' });
    expect(lg.nativeElement.firstElementChild?.getAttribute('data-size')).toBe('lg');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test web-ui
```

- [ ] **Step 3: Make it pass**

```ts
// libs/web-ui/src/lib/avatar/lw-avatar.component.ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { avatarToneFor, type LwAvatarTone } from './avatar-tone';

@Component({
  selector: 'lw-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (photoUrl()) {
      <img
        class="lw-avatar-image"
        [src]="photoUrl()"
        [alt]="alt() || displayName()"
        loading="lazy"
      />
    } @else {
      <span class="lw-avatar-initials">{{ initials() }}</span>
    }
  `,
  host: {
    class: 'lw-avatar',
    '[attr.data-tone]': 'tone()',
    '[attr.data-size]': 'size()',
  },
})
export class LwAvatarComponent {
  readonly photoUrl = input<string | undefined>(undefined);
  readonly displayName = input.required<string>();
  readonly userId = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly alt = input<string>('');

  readonly tone = computed<LwAvatarTone>(() => avatarToneFor(this.userId()));
  readonly initials = computed<string>(() => deriveInitials(this.displayName()));
}

export function deriveInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const words = trimmed.split(/\s+/);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
```

Add minimal styles (or rely on host data attributes for theming — match the existing `LwCover` approach in this lib):

```css
/* libs/web-ui/src/lib/avatar/lw-avatar.component.css (or inline if cover does it inline) */
.lw-avatar { display: inline-flex; align-items: center; justify-content: center; border-radius: 9999px; overflow: hidden; }
.lw-avatar[data-size='sm'] { width: 32px; height: 32px; font-size: 0.75rem; }
.lw-avatar[data-size='md'] { width: 48px; height: 48px; font-size: 1rem; }
.lw-avatar[data-size='lg'] { width: 96px; height: 96px; font-size: 1.5rem; }
.lw-avatar-image { width: 100%; height: 100%; object-fit: cover; }
.lw-avatar-initials { font-weight: 600; color: var(--lw-ink); }
.lw-avatar[data-tone='moss']  { background: var(--lw-moss); }
.lw-avatar[data-tone='clay']  { background: var(--lw-clay); }
.lw-avatar[data-tone='bark']  { background: var(--lw-bark); }
.lw-avatar[data-tone='paper'] { background: var(--lw-paper); }
.lw-avatar[data-tone='ochre'] { background: var(--lw-ochre); }
```

> Verify whether `LwCoverComponent` uses inline styles or a `.css` file and match its convention.

- [ ] **Step 4: Re-export from web-ui index**

```ts
// libs/web-ui/src/index.ts (append)
export * from './lib/avatar/lw-avatar.component';
export * from './lib/avatar/avatar-tone';
```

- [ ] **Step 5: Run tests; verify pass**

```bash
pnpm nx test web-ui
```

- [ ] **Step 6: Commit**

```bash
git add libs/web-ui/src/lib/avatar/ libs/web-ui/src/index.ts
git commit -m "feat(web-ui): LwAvatarComponent with initials + tone fallback"
```

---

## Task 20: `ProfilePictureService` (web HTTP wrapper)

**Files:**
- Create: `libs/web-profile/src/lib/picture/profile-picture.service.ts`
- Test: `libs/web-profile/src/lib/picture/profile-picture.service.spec.ts`

Mirror precedent: `libs/web-courses/src/lib/cover/course-cover.service.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import {
  PROFILE_PICTURE_DECODE_FAILED,
  PROFILE_PICTURE_DIMENSIONS_TOO_SMALL,
  PROFILE_PICTURE_TOO_LARGE,
  UNSUPPORTED_PROFILE_PICTURE_FORMAT,
} from '@learnwren/shared-data-models';

import { ProfilePictureService } from './profile-picture.service';

function file(bytes: number, type: string): File {
  return new File([new Uint8Array(bytes)], 'a.jpg', { type });
}

describe('ProfilePictureService', () => {
  let service: ProfilePictureService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ProfilePictureService, provideHttpClient()],
    });
    service = TestBed.inject(ProfilePictureService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('validateLocally rejects non-JPEG/PNG', () => {
    expect(service.validateLocally(file(10, 'image/gif')).ok).toBe(false);
  });

  it('validateLocally rejects > 2 MB', () => {
    expect(service.validateLocally(file(2_500_000, 'image/jpeg')).ok).toBe(false);
  });

  it('validateLocally accepts a valid JPEG under 2 MB', () => {
    expect(service.validateLocally(file(1024, 'image/jpeg'))).toEqual({ ok: true });
  });

  it('upload posts multipart to PUT /api/profile/picture with field name "file" and returns the snapshot', async () => {
    const promise = service.upload(file(1024, 'image/jpeg'));
    const req = http.expectOne('/api/profile/picture');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).has('file')).toBe(true);
    req.flush({
      uid: 'u1', email: 'a@b.com', displayName: 'Ada', role: 'STUDENT',
      emailVerified: true, photoUrl: 'https://x/avatar.jpg?v=…',
    });
    const me = await promise;
    expect(me.photoUrl).toContain('avatar.jpg');
  });

  it('upload maps 400 PROFILE_PICTURE_DIMENSIONS_TOO_SMALL into a typed error', async () => {
    const p = service.upload(file(1024, 'image/jpeg')).catch((e) => e);
    http.expectOne('/api/profile/picture').flush(
      { error: { code: PROFILE_PICTURE_DIMENSIONS_TOO_SMALL, message: 'too small', details: { width: 200, height: 200 } } },
      { status: 400, statusText: 'Bad Request' },
    );
    const err = await p;
    expect(err.code).toBe(PROFILE_PICTURE_DIMENSIONS_TOO_SMALL);
    expect(err.details).toEqual({ width: 200, height: 200 });
  });

  it('upload maps 413 / 415 / decode-failed', async () => {
    for (const [status, code] of [
      [413, PROFILE_PICTURE_TOO_LARGE],
      [415, UNSUPPORTED_PROFILE_PICTURE_FORMAT],
      [400, PROFILE_PICTURE_DECODE_FAILED],
    ] as const) {
      const p = service.upload(file(1024, 'image/jpeg')).catch((e) => e);
      http.expectOne('/api/profile/picture').flush({ error: { code, message: 'x' } }, { status, statusText: 'x' });
      const err = await p;
      expect(err.code).toBe(code);
    }
  });

  it('remove sends DELETE and returns the snapshot', async () => {
    const promise = service.remove();
    const req = http.expectOne('/api/profile/picture');
    expect(req.request.method).toBe('DELETE');
    req.flush({ uid: 'u1', email: 'a@b.com', displayName: 'Ada', role: 'STUDENT', emailVerified: true });
    const me = await promise;
    expect(me.photoUrl).toBeUndefined();
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test web-profile
```

- [ ] **Step 3: Make it pass**

```ts
// libs/web-profile/src/lib/picture/profile-picture.service.ts
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { AuthenticatedUser } from '@learnwren/web-auth';
import type { ProfilePictureErrorCode } from '@learnwren/shared-data-models';

const MAX_BYTES = 2_000_000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);

export class ProfilePictureError extends Error {
  constructor(
    public readonly code: ProfilePictureErrorCode | 'UNKNOWN',
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ProfilePictureError';
  }
}

@Injectable({ providedIn: 'root' })
export class ProfilePictureService {
  constructor(private readonly http: HttpClient) {}

  async upload(file: File): Promise<AuthenticatedUser> {
    const body = new FormData();
    body.append('file', file);
    try {
      return await firstValueFrom(this.http.put<AuthenticatedUser>('/api/profile/picture', body));
    } catch (err) {
      throw this.toTyped(err);
    }
  }

  async remove(): Promise<AuthenticatedUser> {
    try {
      return await firstValueFrom(this.http.delete<AuthenticatedUser>('/api/profile/picture'));
    } catch (err) {
      throw this.toTyped(err);
    }
  }

  validateLocally(file: File): { ok: true } | { ok: false; reason: string } {
    if (!ALLOWED_MIME.has(file.type)) {
      return { ok: false, reason: 'Profile picture must be JPEG or PNG.' };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, reason: 'Profile picture must be 2 MB or smaller.' };
    }
    return { ok: true };
  }

  private toTyped(err: unknown): ProfilePictureError {
    if (err instanceof HttpErrorResponse && err.error?.error?.code) {
      return new ProfilePictureError(err.error.error.code, err.error.error.message, err.error.error.details);
    }
    return new ProfilePictureError('UNKNOWN', 'Network error.');
  }
}
```

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test web-profile
```

- [ ] **Step 5: Commit**

```bash
git add libs/web-profile/src/lib/picture/profile-picture.service.ts libs/web-profile/src/lib/picture/profile-picture.service.spec.ts
git commit -m "feat(web-profile): ProfilePictureService HTTP wrapper with typed errors"
```

---

## Task 21: `ProfilePictureUploaderComponent`

**Files:**
- Create: `libs/web-profile/src/lib/picture/profile-picture-uploader.component.ts`
- Create: `libs/web-profile/src/lib/picture/profile-picture-uploader.component.html`
- Test: `libs/web-profile/src/lib/picture/profile-picture-uploader.component.spec.ts`

Mirror precedent: `libs/web-courses/src/lib/cover/course-cover-uploader.component.ts`. Differences: no `courseId` input; reads `authService.currentUser()`; calls `setCurrentUser` on success.

- [ ] **Step 1: Write the failing tests**

```ts
// libs/web-profile/src/lib/picture/profile-picture-uploader.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { AuthService } from '@learnwren/web-auth';
import type { AuthenticatedUser } from '@learnwren/web-auth';

import { ProfilePictureService, ProfilePictureError } from './profile-picture.service';
import { ProfilePictureUploaderComponent } from './profile-picture-uploader.component';

function meUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    uid: 'u1' as AuthenticatedUser['uid'],
    email: 'a@b.com',
    displayName: 'Ada',
    role: 'STUDENT',
    emailVerified: true,
    ...overrides,
  } as AuthenticatedUser;
}

function makeFile(bytes: number, type: string): File {
  return new File([new Uint8Array(bytes)], 'a.jpg', { type });
}

describe('ProfilePictureUploaderComponent', () => {
  let svc: { upload: jest.Mock; remove: jest.Mock; validateLocally: jest.Mock };
  let auth: { currentUser: ReturnType<typeof signal<AuthenticatedUser | null>>; setCurrentUser: jest.Mock };

  beforeEach(() => {
    svc = {
      upload: jest.fn(),
      remove: jest.fn(),
      validateLocally: jest.fn().mockReturnValue({ ok: true }),
    };
    auth = { currentUser: signal<AuthenticatedUser | null>(meUser()), setCurrentUser: jest.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: ProfilePictureService, useValue: svc },
        { provide: AuthService, useValue: auth },
      ],
    });
  });

  it('idle → uploading → idle on success; calls setCurrentUser with the snapshot', async () => {
    svc.upload.mockResolvedValue(meUser({ photoUrl: 'https://x/avatar.jpg?v=…' }));
    const f = TestBed.createComponent(ProfilePictureUploaderComponent);
    f.detectChanges();
    await f.componentInstance.onFileSelected(makeFile(1024, 'image/jpeg'));
    expect(svc.upload).toHaveBeenCalled();
    expect(auth.setCurrentUser).toHaveBeenCalledWith(expect.objectContaining({ photoUrl: expect.any(String) }));
    expect(f.componentInstance.state()).toBe('idle');
  });

  it('client-side validation failure does not call upload', async () => {
    svc.validateLocally.mockReturnValue({ ok: false, reason: 'too big' });
    const f = TestBed.createComponent(ProfilePictureUploaderComponent);
    f.detectChanges();
    await f.componentInstance.onFileSelected(makeFile(3_000_000, 'image/jpeg'));
    expect(svc.upload).not.toHaveBeenCalled();
    expect(f.componentInstance.state()).toBe('failed');
  });

  it('server error transitions to failed; retry returns to idle', async () => {
    svc.upload.mockRejectedValue(new ProfilePictureError('PROFILE_PICTURE_DIMENSIONS_TOO_SMALL', 'too small'));
    const f = TestBed.createComponent(ProfilePictureUploaderComponent);
    f.detectChanges();
    await f.componentInstance.onFileSelected(makeFile(1024, 'image/jpeg'));
    expect(f.componentInstance.state()).toBe('failed');
    f.componentInstance.dismissError();
    expect(f.componentInstance.state()).toBe('idle');
  });

  it('remove → idle without photoUrl, calls setCurrentUser with snapshot lacking photoUrl', async () => {
    auth.currentUser.set(meUser({ photoUrl: 'https://x/avatar.jpg?v=…' }));
    svc.remove.mockResolvedValue(meUser());
    const f = TestBed.createComponent(ProfilePictureUploaderComponent);
    f.detectChanges();
    await f.componentInstance.onRemove();
    expect(svc.remove).toHaveBeenCalled();
    expect(auth.setCurrentUser).toHaveBeenCalledWith(expect.objectContaining({ photoUrl: undefined }));
    expect(f.componentInstance.state()).toBe('idle');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test web-profile
```

- [ ] **Step 3: Make it pass**

```ts
// libs/web-profile/src/lib/picture/profile-picture-uploader.component.ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { AuthService } from '@learnwren/web-auth';
import { LwAvatarComponent } from '@learnwren/web-ui';

import { ProfilePictureError, ProfilePictureService } from './profile-picture.service';

export type UploaderState = 'idle' | 'uploading' | 'failed';

@Component({
  selector: 'lib-profile-picture-uploader',
  standalone: true,
  imports: [LwAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-picture-uploader.component.html',
})
export class ProfilePictureUploaderComponent {
  private readonly svc = inject(ProfilePictureService);
  private readonly auth = inject(AuthService);

  readonly currentUser = this.auth.currentUser;
  readonly state = signal<UploaderState>('idle');
  readonly errorReason = signal<string | null>(null);

  async onFileSelected(file: File): Promise<void> {
    const v = this.svc.validateLocally(file);
    if (!v.ok) {
      this.state.set('failed');
      this.errorReason.set(v.reason);
      return;
    }
    this.state.set('uploading');
    this.errorReason.set(null);
    try {
      const me = await this.svc.upload(file);
      this.auth.setCurrentUser(me);
      this.state.set('idle');
    } catch (err) {
      const e = err as ProfilePictureError;
      this.state.set('failed');
      this.errorReason.set(this.copyForCode(e.code));
    }
  }

  async onRemove(): Promise<void> {
    this.state.set('uploading');
    try {
      const me = await this.svc.remove();
      this.auth.setCurrentUser(me);
      this.state.set('idle');
    } catch (err) {
      const e = err as ProfilePictureError;
      this.state.set('failed');
      this.errorReason.set(this.copyForCode(e.code));
    }
  }

  dismissError(): void {
    this.state.set('idle');
    this.errorReason.set(null);
  }

  private copyForCode(code: string): string {
    switch (code) {
      case 'PROFILE_PICTURE_DIMENSIONS_TOO_SMALL':
        return 'Profile picture must be at least 256×256 pixels.';
      case 'PROFILE_PICTURE_DECODE_FAILED':
        return 'That image could not be read. Try a different file.';
      case 'PROFILE_PICTURE_TOO_LARGE':
        return 'Profile picture must be 2 MB or smaller.';
      case 'UNSUPPORTED_PROFILE_PICTURE_FORMAT':
        return 'Profile picture must be JPEG or PNG.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
}
```

```html
<!-- libs/web-profile/src/lib/picture/profile-picture-uploader.component.html -->
@if (currentUser(); as me) {
  <div class="flex items-center gap-4">
    <lw-avatar
      [photoUrl]="me.photoUrl"
      [displayName]="me.displayName"
      [userId]="me.uid"
      size="lg"
    />

    <div class="flex flex-col gap-2">
      @switch (state()) {
        @case ('idle') {
          <label class="cursor-pointer underline">
            <input
              hidden
              type="file"
              accept="image/jpeg,image/png"
              (change)="onFileSelected($any($event.target).files[0])"
            />
            {{ me.photoUrl ? 'Replace picture' : 'Upload picture' }}
          </label>
          @if (me.photoUrl) {
            <button type="button" class="underline text-left" (click)="onRemove()">Remove picture</button>
          }
        }
        @case ('uploading') {
          <p>Uploading…</p>
        }
        @case ('failed') {
          <p class="text-error">{{ errorReason() }}</p>
          <button type="button" class="underline text-left" (click)="dismissError()">Dismiss</button>
        }
      }
    </div>
  </div>
}
```

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test web-profile
```

- [ ] **Step 5: Commit**

```bash
git add libs/web-profile/src/lib/picture/profile-picture-uploader.component.ts \
        libs/web-profile/src/lib/picture/profile-picture-uploader.component.html \
        libs/web-profile/src/lib/picture/profile-picture-uploader.component.spec.ts
git commit -m "feat(web-profile): ProfilePictureUploaderComponent with idle/uploading/failed states"
```

---

## Task 22: Mount uploader in `ProfilePageComponent`

**Files:**
- Modify: `libs/web-profile/src/lib/profile-page/profile-page.component.ts` (imports)
- Modify: `libs/web-profile/src/lib/profile-page/profile-page.component.html`
- Modify: `libs/web-profile/src/lib/profile-page/profile-page.component.spec.ts` (just an assertion the uploader is present)

- [ ] **Step 1: Write the failing test**

Append:

```ts
it('renders the profile picture uploader', () => {
  const f = TestBed.createComponent(ProfilePageComponent);
  f.detectChanges();
  expect(f.nativeElement.querySelector('lib-profile-picture-uploader')).toBeTruthy();
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test web-profile
```

- [ ] **Step 3: Make it pass**

In `profile-page.component.ts`, add `ProfilePictureUploaderComponent` to the standalone `imports` array.

In `profile-page.component.html`, mount above the text form (replace the leading `<section>` opener if needed):

```html
<section class="mb-6">
  <h2 class="text-h3 mb-2">Profile picture</h2>
  <lib-profile-picture-uploader />
</section>

<!-- (existing text-fields form below) -->
```

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test web-profile
```

- [ ] **Step 5: Commit**

```bash
git add libs/web-profile/src/lib/profile-page/
git commit -m "feat(web-profile): mount profile picture uploader on settings page"
```

---

## Task 23: Header chip swap to `<lw-avatar>`

**Files:**
- Modify: `apps/web/src/app/app.ts` (or `app.html` if templates are inline-free)
- Modify: `apps/web/src/app/app.spec.ts`

- [ ] **Step 1: Locate the current chip**

```bash
grep -n "currentUser()\|user-menu\|displayName" apps/web/src/app/app.ts apps/web/src/app/app.html 2>/dev/null | head -20
```

Identify the template fragment that renders the display name in the user menu.

- [ ] **Step 2: Write the failing test**

Add to `app.spec.ts`:

```ts
it('header user-menu renders <lw-avatar> bound to current user', () => {
  // adjust to whatever test-bed setup app.spec.ts already uses
  authStub.setCurrentUser({ uid: 'u1', email: 'a@b.com', displayName: 'Ada', role: 'STUDENT', emailVerified: true });
  fixture.detectChanges();
  const avatar = fixture.nativeElement.querySelector('lw-avatar');
  expect(avatar).toBeTruthy();
});
```

- [ ] **Step 3: Verify failure**

```bash
pnpm nx test web
```

- [ ] **Step 4: Make it pass**

In `apps/web/src/app/app.ts`, add `LwAvatarComponent` to the standalone `imports`. Update the user-menu template fragment so the chip becomes:

```html
@if (auth.currentUser(); as me) {
  <button class="user-chip" (click)="...">
    <lw-avatar [photoUrl]="me.photoUrl" [displayName]="me.displayName" [userId]="me.uid" size="sm" />
    <span class="user-chip-name">{{ me.displayName }}</span>
  </button>
}
```

- [ ] **Step 5: Run tests; verify pass**

```bash
pnpm nx test web
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/app.ts apps/web/src/app/app.spec.ts apps/web/src/app/app.html
git commit -m "feat(web): header user-menu chip uses LwAvatarComponent"
```

---

## Task 24: Course card avatar slot

**Files:**
- Modify: `libs/web-catalog/src/lib/components/course-card/course-card.component.ts` (imports)
- Modify: `libs/web-catalog/src/lib/components/course-card/course-card.component.html`
- Modify: `libs/web-catalog/src/lib/components/course-card/course-card.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
it('renders <lw-avatar> bound to instructorPhotoUrl + instructorId', () => {
  const f = TestBed.createComponent(CourseCardComponent);
  f.componentRef.setInput('course', {
    id: 'c1', title: 'Intro', description: 'd',
    instructorId: 'u1', instructorDisplayName: 'Ada',
    instructorPhotoUrl: 'https://x/avatar.jpg?v=…',
    publishedAt: '2026-05-28T00:00:00.000Z',
  });
  f.detectChanges();
  const avatar = f.nativeElement.querySelector('lw-avatar');
  expect(avatar).toBeTruthy();
  const img = avatar.querySelector('img');
  expect(img?.getAttribute('src')).toContain('avatar.jpg');
});

it('renders initials fallback when instructorPhotoUrl is absent', () => {
  const f = TestBed.createComponent(CourseCardComponent);
  f.componentRef.setInput('course', {
    id: 'c1', title: 'Intro', description: 'd',
    instructorId: 'u1', instructorDisplayName: 'Ada',
    publishedAt: '2026-05-28T00:00:00.000Z',
  });
  f.detectChanges();
  expect(f.nativeElement.querySelector('lw-avatar img')).toBeNull();
  expect(f.nativeElement.querySelector('lw-avatar .lw-avatar-initials')?.textContent?.trim()).toBe('AD');
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test web-catalog
```

- [ ] **Step 3: Make it pass**

Add `LwAvatarComponent` to the component's `imports`. In `course-card.component.html`:

```html
<div class="byline flex items-center gap-2">
  <lw-avatar
    [photoUrl]="course().instructorPhotoUrl"
    [displayName]="course().instructorDisplayName"
    [userId]="course().instructorId"
    size="sm"
  />
  <p class="text-sm text-ink-2">{{ course().instructorDisplayName }}</p>
</div>
```

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test web-catalog
```

- [ ] **Step 5: Commit**

```bash
git add libs/web-catalog/src/lib/components/course-card/
git commit -m "feat(web-catalog): course card renders instructor avatar"
```

---

## Task 25: Course detail instructor block + biography

**Files:**
- Modify: `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.ts` (imports)
- Modify: `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.html`
- Modify: `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it('renders the instructor card with avatar and biography', () => {
  // seed fixture with instructorPhotoUrl + instructorBiography
  // ...
  f.detectChanges();
  const card = f.nativeElement.querySelector('[data-test="instructor-card"]');
  expect(card).toBeTruthy();
  expect(card.querySelector('lw-avatar img')).toBeTruthy();
  expect(card.textContent).toContain('Mathematician.');
});

it('hides the biography paragraph when instructorBiography is undefined', () => {
  // ...
  f.detectChanges();
  expect(f.nativeElement.querySelector('[data-test="instructor-bio"]')).toBeNull();
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm nx test web-catalog
```

- [ ] **Step 3: Make it pass**

In `course-detail-page.component.html`, replace the current `By {{ course()!.instructorDisplayName }}` line with an instructor card:

```html
<section data-test="instructor-card" class="lw-card flex items-start gap-4">
  <lw-avatar
    [photoUrl]="course()!.instructorPhotoUrl"
    [displayName]="course()!.instructorDisplayName"
    [userId]="course()!.instructorId"
    size="md"
  />
  <div>
    <p class="font-medium">{{ course()!.instructorDisplayName }}</p>
    @if (course()!.instructorBiography) {
      <p data-test="instructor-bio" class="text-ink-2 mt-1">{{ course()!.instructorBiography }}</p>
    }
  </div>
</section>
```

Add `LwAvatarComponent` to the component's `imports`.

- [ ] **Step 4: Run tests; verify pass**

```bash
pnpm nx test web-catalog
```

- [ ] **Step 5: Commit**

```bash
git add libs/web-catalog/src/lib/course-detail-page/
git commit -m "feat(web-catalog): course detail renders instructor card with avatar + biography"
```

---

## Task 26: api-e2e golden path with `FakePictureStorageAdapter`

**Files:**
- Create: `apps/api-e2e/src/profile-picture.e2e-spec.ts`

Mirror precedent: `apps/api-e2e/src/cover.e2e-spec.ts` (or whatever filename the cover e2e took — `grep -rn "FakeCoverStorage" apps/api-e2e/` to find it).

- [ ] **Step 1: Locate the cover e2e**

```bash
grep -rn "FakeCoverStorage\|course-covers" apps/api-e2e/src | head -10
```

- [ ] **Step 2: Write the e2e**

```ts
// apps/api-e2e/src/profile-picture.e2e-spec.ts
import sharp from 'sharp';
import { FakePictureStorageAdapter, PICTURE_STORAGE } from '@learnwren/api-profile';

describe('UC-01-03 Slice B — profile picture (api e2e)', () => {
  let app: /* INestApplication */;
  let storage: FakePictureStorageAdapter;
  let cookie: string;

  beforeAll(async () => {
    storage = new FakePictureStorageAdapter();
    // Bootstrap the testing module the same way cover.e2e-spec.ts does, but
    // override PICTURE_STORAGE with the fake. Copy that file's pattern verbatim.
    // ...
    cookie = await registerAndLogin(app, { email: 'a@b.com', password: 'P@ssw0rd1234' });
  });

  afterAll(async () => app.close());

  it('PUT → GET → DELETE → GET', async () => {
    const file = await sharp({
      create: { width: 512, height: 512, channels: 3, background: { r: 100, g: 100, b: 100 } },
    }).jpeg().toBuffer();

    const put = await request(app.getHttpServer())
      .put('/api/profile/picture')
      .set('Cookie', cookie)
      .attach('file', file, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(put.status).toBe(200);
    expect(put.body.photoUrl).toMatch(/profile-pictures\/.+\/avatar\.jpg\?v=/);
    expect(storage.has(`profile-pictures/${put.body.uid}/avatar.jpg`)).toBe(true);

    const get = await request(app.getHttpServer()).get('/api/profile').set('Cookie', cookie);
    expect(get.body.photoUrl).toBe(put.body.photoUrl);

    const del = await request(app.getHttpServer()).delete('/api/profile/picture').set('Cookie', cookie);
    expect(del.status).toBe(200);
    expect(del.body.photoUrl).toBeUndefined();
    expect(storage.has(`profile-pictures/${put.body.uid}/avatar.jpg`)).toBe(false);

    const get2 = await request(app.getHttpServer()).get('/api/profile').set('Cookie', cookie);
    expect(get2.body.photoUrl).toBeUndefined();
  });
});
```

> Adapt `registerAndLogin` to whatever helper the existing api-e2e suite provides.

- [ ] **Step 3: Run it**

```bash
pnpm nx e2e api-e2e --testFile=profile-picture
```

Expected: PASS without any GCP credentials in the environment.

- [ ] **Step 4: Commit**

```bash
git add apps/api-e2e/src/profile-picture.e2e-spec.ts
git commit -m "test(api-e2e): UC-01-03 Slice B golden path via FakePictureStorageAdapter"
```

---

## Task 27: web-e2e golden path (Playwright)

**Files:**
- Create: `apps/web-e2e/src/profile-picture.spec.ts`
- Create fixture: `apps/web-e2e/fixtures/avatar-512.jpg` (generate locally, see Step 1)

- [ ] **Step 1: Create the fixture**

```bash
node -e "
const sharp = require('sharp');
sharp({ create: { width: 512, height: 512, channels: 3, background: { r: 100, g: 150, b: 100 } } })
  .jpeg().toFile('apps/web-e2e/fixtures/avatar-512.jpg');
"
```

- [ ] **Step 2: Write the e2e**

```ts
// apps/web-e2e/src/profile-picture.spec.ts
import { expect, test } from '@playwright/test';
import { randomBytes } from 'crypto';
import { resolve } from 'path';

test('UC-01-03 Slice B — upload, see avatar across reload, remove', async ({ page }) => {
  const email = `e2e-${randomBytes(4).toString('hex')}@learnwren.test`;
  await page.goto('/register');
  // mirror existing auth e2e — copy whatever the registration helper looks like
  await page.fill('[data-test="email"]', email);
  await page.fill('[data-test="displayName"]', 'Ada Lovelace');
  await page.fill('[data-test="password"]', 'P@ssw0rd1234');
  await page.click('[data-test="submit"]');
  await page.waitForURL('**/dashboard');

  // Header avatar initially shows initials.
  const headerAvatar = page.locator('header lw-avatar');
  await expect(headerAvatar.locator('.lw-avatar-initials')).toHaveText('AL');

  // Open user menu → Profile settings.
  await page.click('[data-test="user-menu"]');
  await page.click('text="Profile settings"');
  await page.waitForURL('**/settings/profile');

  // Upload.
  await page.setInputFiles('input[type="file"]', resolve(__dirname, '../fixtures/avatar-512.jpg'));
  await expect(headerAvatar.locator('img')).toBeVisible({ timeout: 10_000 });

  // Reload — avatar persists.
  await page.reload();
  await expect(headerAvatar.locator('img')).toBeVisible();

  // Remove.
  await page.click('button:has-text("Remove picture")');
  await expect(headerAvatar.locator('img')).toBeHidden();
  await expect(headerAvatar.locator('.lw-avatar-initials')).toHaveText('AL');
});
```

> Adjust selectors to match the existing data-test attributes in `apps/web` (the cover and Slice A e2e specs are the closest references).

- [ ] **Step 3: Run it**

Ensure emulators + dev server are up (`pnpm emulators` + `pnpm start`), then:

```bash
pnpm nx e2e web-e2e --grep="UC-01-03 Slice B"
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web-e2e/src/profile-picture.spec.ts apps/web-e2e/fixtures/avatar-512.jpg
git commit -m "test(web-e2e): UC-01-03 Slice B profile picture golden path"
```

---

## Task 28: Catalog avatar piggy-back assertion

**Files:**
- Modify: an existing `apps/web-e2e/src/*catalog*.spec.ts` test

- [ ] **Step 1: Locate the catalog e2e**

```bash
ls apps/web-e2e/src | grep -i catalog
```

- [ ] **Step 2: Add a small assertion**

Inside an existing test that already renders a course card, add:

```ts
// Find the first card whose instructor has a photoUrl in seed data
const cardWithPhoto = page.locator('[data-test="course-card"]').filter({
  has: page.locator('lw-avatar img'),
}).first();
await expect(cardWithPhoto.locator('lw-avatar img')).toBeVisible();

// And one that falls back to initials
const cardWithInitials = page.locator('[data-test="course-card"]').filter({
  has: page.locator('lw-avatar .lw-avatar-initials'),
}).first();
await expect(cardWithInitials.locator('lw-avatar .lw-avatar-initials')).toHaveText(/^[A-Z]{2}$/);
```

This requires the e2e seed to have at least one instructor with a `photoUrl` and one without. Check the seed file (`apps/web-e2e/fixtures/seed.ts` or similar) and add a `photoUrl` to one instructor if necessary.

- [ ] **Step 3: Run it**

```bash
pnpm nx e2e web-e2e
```

- [ ] **Step 4: Commit**

```bash
git add apps/web-e2e/src apps/web-e2e/fixtures
git commit -m "test(web-e2e): assert course-card avatar render + initials fallback"
```

---

## Task 29: Drift updates (docs)

**Files:**
- Modify: `docs/use-cases/01-user-identity-and-access.md`
- Modify: `docs/quality/spec-drift-report.md`
- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md`

- [ ] **Step 1: Update the use case status banner**

Edit the top of `docs/use-cases/01-user-identity-and-access.md` — replace the existing "UC-01-03 partially implemented" sentence with:

```
UC-01-03 (Manage Profile) is **partially implemented**: Slices A + B (text profile + picture) shipped 2026-05-28 and YYYY-MM-DD (see specs `2026-05-27-uc-01-03-slice-a-text-profile-design.md` and `2026-05-28-uc-01-03-slice-b-profile-picture-design.md`). Email-change (ext 3b) and password-change (ext 3c / 3c-3a / 3c-4a) remain deferred to Slices C/D.
```

Fill in the actual ship date when merging to main.

- [ ] **Step 2: Update the drift report**

Find the EP-01 / UC-01-03 row in `docs/quality/spec-drift-report.md`. Flip the picture row from "DEFERRED" to "IMPLEMENTED"; keep email + password rows as deferred.

- [ ] **Step 3: Update README**

In the "Built so far" / implemented-features list, add a bullet:

```
- Profile picture upload (JPEG/PNG, ≤2 MB, auto-cropped to 512×512); avatar surfaces in the header, on course cards, and on the course detail page.
```

- [ ] **Step 4: Update USER_GUIDE**

Add a "Profile picture" subsection under the existing "Profile settings" section documenting the upload / replace / remove flow and the initials fallback.

- [ ] **Step 5: Commit**

```bash
git add docs/use-cases/01-user-identity-and-access.md \
        docs/quality/spec-drift-report.md \
        README.md \
        docs/USER_GUIDE.md
git commit -m "docs: reconcile UC-01-03 Slice B status across drift report + user guide"
```

---

## Task 30: Full-workspace verification + merge to main

- [ ] **Step 1: Run the entire test + lint + typecheck graph**

```bash
pnpm nx run-many -t lint,test,typecheck,build --output-style=stream
```

Expected: all green. If `dist/out-tsc` looks stale (memory `feedback_worktree_dist_hazard.md`):

```bash
rm -rf dist
NX_DAEMON=false pnpm nx run-many -t test,build --skip-nx-cache
```

- [ ] **Step 2: Run both e2e suites**

```bash
pnpm nx e2e api-e2e
pnpm nx e2e web-e2e
```

- [ ] **Step 3: Merge to main (local --no-ff)**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren
git fetch /Volumes/Artie-Storage/github-repos/learnwren-uc-01-03-slice-b feat/uc-01-03-slice-b-profile-picture:feat/uc-01-03-slice-b-profile-picture
git merge --no-ff feat/uc-01-03-slice-b-profile-picture -m "Merge feat/uc-01-03-slice-b-profile-picture: UC-01-03 Slice B"
```

- [ ] **Step 4: Tear down the worktree**

```bash
git worktree remove /Volumes/Artie-Storage/github-repos/learnwren-uc-01-03-slice-b
git branch -d feat/uc-01-03-slice-b-profile-picture
```

The `node_modules` symlink in the worktree is removed automatically with the directory.

- [ ] **Step 5: Final smoke**

```bash
pnpm nx run-many -t test,build
pnpm nx e2e api-e2e
pnpm nx e2e web-e2e
```

All green ⇒ UC-01-03 Slice B is in.
