# Auth Pages Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the five `web-auth` pages (login, register, register-confirm, forgot-password, unlock) into the Learn Wren dark design system so their text is legible on the dark theme.

**Architecture:** This is Slice 3 of the design-system adoption (`docs/superpowers/specs/2026-05-22-design-system-adoption-design.md` §4). It builds on the completed foundation (token layer, `web-ui` library, app shell). One new `web-ui` primitive is added — an `lwInput` directive — then each auth page's template is restyled to use design-system surfaces (`bg-bg-2` card), the `lwInput` directive, the existing `lwButton` directive, and design-token text colors (`text-ink`, `text-ink-2`, `text-bad`, `text-warn`, `text-good`, `text-ochre`). No component logic changes — only templates and `@Component.imports`.

**Tech Stack:** Nx monorepo, Angular 21 (standalone), Tailwind CSS v3 bound to `--lw-*` CSS variables, Vitest (`@analogjs/vitest-angular`).

**Why the pages look faint today:** the foundation set the global `body` text color to `var(--lw-ink)` (warm white, correct for the dark theme). The auth pages still have `bg-white` cards with text that inherits color — so light text on a white card. Restyling the cards to the dark `bg-bg-2` surface and using explicit design-token text colors fixes this.

**Two intentional deviations from the spec's prose:**
- The spec says "card surface (lw-card)". The restyle applies the card *surface classes* (`bg-bg-2 border border-line rounded-lg`) directly to each page's existing `<section>` wrapper rather than wrapping content in the `<lw-card>` component — identical visual result, no per-file component import, and a page-wrapper `<section>` reads more naturally than a card component. `LwCardComponent` remains available for genuine card components (course cards) in later slices.
- The spec says "lwButton (... ghost for secondary links)". Secondary navigation links are `<a routerLink>` elements; the `lwButton` directive's selector is `button[lwButton]` and does not apply to anchors. Inline links are styled as `text-ochre hover:underline` text links instead, which is the correct treatment for inline links. The `lwButton` directive is used on all `<button>` elements.

**Centering:** the app shell already centers unauthenticated routes (its `@else` branch is `flex min-h-screen flex-col items-center justify-center`). The restyled cards therefore drop the old `mx-auto mt-12` and only set `w-full max-w-md`.

---

## File Structure

**Created:**
- `libs/web-ui/src/lib/input/lw-input.directive.ts` — `lwInput` attribute directive (design-system text input styling).
- `libs/web-ui/src/lib/input/lw-input.directive.spec.ts` — its test.

**Modified:**
- `libs/web-ui/src/index.ts` — export the new directive (10th export).
- `libs/web-auth/src/lib/login-page/login-page.component.{ts,html}`
- `libs/web-auth/src/lib/register-page/register-page.component.{ts,html}`
- `libs/web-auth/src/lib/register-confirm-page/register-confirm-page.component.{ts,html}`
- `libs/web-auth/src/lib/forgot-password-page/forgot-password-page.component.{ts,html}`
- `libs/web-auth/src/lib/unlock-page/unlock-page.component.html` (template only — no import change needed)
- `libs/web-auth/tsconfig.lib.json` (via `nx sync`, Task 7 — `web-auth` now depends on `web-ui`)

**Not changed:** every `*.component.ts` file's class body, every `*.component.spec.ts`. The auth specs assert on text content and element types (`<button>`, `<input formControlName>`), not CSS classes — the restyle preserves all of those, so the existing specs stay green and are the safety net for each task.

---

## Task 1: Add the `lwInput` directive to `web-ui`

**Files:**
- Create: `libs/web-ui/src/lib/input/lw-input.directive.ts`
- Create: `libs/web-ui/src/lib/input/lw-input.directive.spec.ts`
- Modify: `libs/web-ui/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-ui/src/lib/input/lw-input.directive.spec.ts`:
```ts
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwInputDirective } from './lw-input.directive';

@Component({
  standalone: true,
  imports: [LwInputDirective],
  template: `<input lwInput type="email" />`,
})
class HostComponent {}

describe('LwInputDirective', () => {
  it('applies the design-system input classes to the host input', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.classList.contains('w-full')).toBe(true);
    expect(input.classList.contains('rounded')).toBe(true);
    expect(input.classList.contains('border-line')).toBe(true);
    expect(input.classList.contains('bg-bg')).toBe(true);
    expect(input.classList.contains('text-ink')).toBe(true);
  });

  it('preserves any class the consumer puts on the input', () => {
    TestBed.resetTestingModule();

    @Component({
      standalone: true,
      imports: [LwInputDirective],
      template: `<input lwInput class="mt-1" />`,
    })
    class WithClassHost {}

    const fixture = TestBed.createComponent(WithClassHost);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.classList.contains('mt-1')).toBe(true);
    expect(input.classList.contains('bg-bg')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test web-ui`
Expected: FAIL — cannot resolve `./lw-input.directive`.

- [ ] **Step 3: Write the implementation**

Create `libs/web-ui/src/lib/input/lw-input.directive.ts`:
```ts
import { Directive } from '@angular/core';

@Directive({
  selector: 'input[lwInput]',
  standalone: true,
  host: {
    class:
      'block w-full rounded border border-line bg-bg px-3 py-2 text-ink outline-none placeholder:text-ink-4 focus:border-ochre disabled:opacity-50',
  },
})
export class LwInputDirective {}
```

- [ ] **Step 4: Add the export**

Replace `libs/web-ui/src/index.ts` with:
```ts
export * from './lib/theme/theme.service';
export * from './lib/icon/lw-icon.component';
export * from './lib/button/lw-button.directive';
export * from './lib/wordmark/lw-wordmark.component';
export * from './lib/card/lw-card.component';
export * from './lib/pill/lw-pill.component';
export * from './lib/progress/lw-progress.component';
export * from './lib/cover/lw-cover.component';
export * from './lib/theme-toggle/theme-toggle.component';
export * from './lib/input/lw-input.directive';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm nx test web-ui`
Expected: PASS (2 new tests; 29 total in the lib).

- [ ] **Step 6: Commit**

```bash
git add libs/web-ui/src
git commit -m "feat(web-ui): add lwInput directive for design-system text inputs"
```

---

## Task 2: Restyle the login page

Restyle task — not test-first. The existing `login-page.component.spec.ts` (which asserts on error text and element types) is the safety net: it must stay green.

**Files:**
- Modify: `libs/web-auth/src/lib/login-page/login-page.component.ts`
- Modify: `libs/web-auth/src/lib/login-page/login-page.component.html`

- [ ] **Step 1: Add the design-system imports to the component**

In `libs/web-auth/src/lib/login-page/login-page.component.ts`, add this import near the other imports (after the existing `import` lines):
```ts
import { LwButtonDirective, LwInputDirective } from '@learnwren/web-ui';
```
And change the `@Component` `imports` array from:
```ts
  imports: [ReactiveFormsModule, RouterLink],
```
to:
```ts
  imports: [ReactiveFormsModule, RouterLink, LwButtonDirective, LwInputDirective],
```
Make no other change to the file.

- [ ] **Step 2: Rewrite the template**

Replace the entire contents of `libs/web-auth/src/lib/login-page/login-page.component.html` with:
```html
<section class="w-full max-w-md rounded-lg border border-line bg-bg-2 p-6">
  <h1 class="mb-4 text-xl">Sign in</h1>
  <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-3">
    <label class="block">
      <span class="text-sm font-medium text-ink-2">Email</span>
      <input
        lwInput
        type="email"
        formControlName="email"
        autocomplete="email"
        class="mt-1"
        required
      />
    </label>

    <label class="block">
      <span class="text-sm font-medium text-ink-2">Password</span>
      <input
        lwInput
        type="password"
        formControlName="password"
        autocomplete="current-password"
        class="mt-1"
        required
      />
    </label>

    @switch (errorState().kind) {
      @case ('invalid') {
        <p class="text-sm text-bad" role="alert">Invalid email or password.</p>
      }
      @case ('unverified') {
        <div role="alert" class="space-y-1">
          <p class="text-sm text-bad">
            Please verify your email address before logging in.
          </p>
          @if (unverifiedState()?.resendSent) {
            <p class="text-sm text-good">Verification email sent. Check your inbox.</p>
          } @else {
            <button lwButton variant="ghost" type="button" (click)="resendVerification()">
              Resend verification email
            </button>
          }
        </div>
      }
      @case ('locked') {
        <div role="alert" class="space-y-1">
          <p class="text-sm text-bad">
            Your account is temporarily locked. Try again at
            {{ unlockAvailableAtLocal(lockedState()?.unlockAvailableAt ?? '') }},
            or check your email to unlock now.
          </p>
          @if (justResetPassword()) {
            <p class="text-sm text-warn">
              If you've just reset your password, use the unlock link in your
              "account locked" email or wait until
              {{ unlockAvailableAtLocal(lockedState()?.unlockAvailableAt ?? '') }}.
            </p>
          }
        </div>
      }
      @case ('generic') {
        <p class="text-sm text-bad" role="alert">{{ genericState()?.message }}</p>
      }
    }

    <button
      lwButton
      variant="primary"
      type="submit"
      class="w-full justify-center disabled:opacity-50"
      [disabled]="form.invalid || busy()"
    >
      @if (busy()) { Signing in… } @else { Sign in }
    </button>
  </form>

  <p class="mt-4 text-sm text-ink-2">
    <a routerLink="/forgot-password" class="text-ochre hover:underline">Forgot password?</a>
  </p>

  <p class="mt-2 text-sm text-ink-2">
    No account? <a routerLink="/register" class="text-ochre hover:underline">Register</a>
  </p>
</section>
```

- [ ] **Step 3: Run the web-auth tests**

Run: `pnpm nx test web-auth`
Expected: PASS — all existing web-auth specs, including `login-page.component.spec.ts`, stay green (the restyle changed classes and the card element, not text content or `<input>`/`<button>` element types).

- [ ] **Step 4: Commit**

```bash
git add libs/web-auth/src/lib/login-page
git commit -m "feat(web-auth): restyle the login page in the design system"
```

---

## Task 3: Restyle the register page

Restyle task — the existing `register-page.component.spec.ts` must stay green.

**Files:**
- Modify: `libs/web-auth/src/lib/register-page/register-page.component.ts`
- Modify: `libs/web-auth/src/lib/register-page/register-page.component.html`

- [ ] **Step 1: Add the design-system imports to the component**

In `libs/web-auth/src/lib/register-page/register-page.component.ts`, add near the other imports:
```ts
import { LwButtonDirective, LwInputDirective } from '@learnwren/web-ui';
```
And change the `@Component` `imports` array from:
```ts
  imports: [ReactiveFormsModule, RouterLink],
```
to:
```ts
  imports: [ReactiveFormsModule, RouterLink, LwButtonDirective, LwInputDirective],
```
Make no other change to the file.

- [ ] **Step 2: Rewrite the template**

Replace the entire contents of `libs/web-auth/src/lib/register-page/register-page.component.html` with:
```html
<section class="w-full max-w-md rounded-lg border border-line bg-bg-2 p-6">
  <h1 class="mb-4 text-xl">Create an account</h1>
  <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-3">
    <label class="block">
      <span class="text-sm font-medium text-ink-2">Display name</span>
      <input
        lwInput
        type="text"
        formControlName="displayName"
        autocomplete="name"
        class="mt-1"
        required
      />
    </label>

    <label class="block">
      <span class="text-sm font-medium text-ink-2">Email</span>
      <input
        lwInput
        type="email"
        formControlName="email"
        autocomplete="email"
        class="mt-1"
        required
      />
    </label>

    <label class="block">
      <span class="text-sm font-medium text-ink-2">Password</span>
      <input
        lwInput
        type="password"
        formControlName="password"
        autocomplete="new-password"
        class="mt-1"
        required
      />
      @if (passwordHints().length > 0) {
        <ul class="mt-1 list-inside list-disc text-xs text-ink-3">
          @for (hint of passwordHints(); track hint) {
            <li>{{ hint }}</li>
          }
        </ul>
      }
    </label>

    @if (error()) {
      <p class="text-sm text-bad" role="alert">{{ error() }}</p>
    }

    <button
      lwButton
      variant="primary"
      type="submit"
      class="w-full justify-center disabled:opacity-50"
      [disabled]="form.invalid || busy()"
    >
      @if (busy()) { Creating account… } @else { Create account }
    </button>
  </form>

  <p class="mt-4 text-sm text-ink-2">
    Already have an account?
    <a routerLink="/login" class="text-ochre hover:underline">Sign in</a>
  </p>
</section>
```

- [ ] **Step 3: Run the web-auth tests**

Run: `pnpm nx test web-auth`
Expected: PASS — all existing web-auth specs stay green.

- [ ] **Step 4: Commit**

```bash
git add libs/web-auth/src/lib/register-page
git commit -m "feat(web-auth): restyle the register page in the design system"
```

---

## Task 4: Restyle the register-confirm page

Restyle task — the existing `register-confirm-page.component.spec.ts` (asserts on text and `querySelector('button')`) must stay green.

**Files:**
- Modify: `libs/web-auth/src/lib/register-confirm-page/register-confirm-page.component.ts`
- Modify: `libs/web-auth/src/lib/register-confirm-page/register-confirm-page.component.html`

- [ ] **Step 1: Add the design-system import to the component**

In `libs/web-auth/src/lib/register-confirm-page/register-confirm-page.component.ts`, add near the other imports:
```ts
import { LwButtonDirective } from '@learnwren/web-ui';
```
And change the `@Component` `imports` array from:
```ts
  imports: [RouterLink],
```
to:
```ts
  imports: [RouterLink, LwButtonDirective],
```
Make no other change to the file.

- [ ] **Step 2: Rewrite the template**

Replace the entire contents of `libs/web-auth/src/lib/register-confirm-page/register-confirm-page.component.html` with:
```html
<section class="w-full max-w-md space-y-3 rounded-lg border border-line bg-bg-2 p-6">
  <h1 class="text-xl">Check your email</h1>
  <p class="text-sm text-ink-2">
    We sent a verification email
    @if (email()) { to <strong class="text-ink">{{ email() }}</strong> }
    . Click the link in that email to verify your address.
  </p>

  @if (resentAt()) {
    <p class="text-sm text-good">Verification email sent.</p>
  }

  <button
    lwButton
    type="button"
    class="disabled:opacity-50"
    [disabled]="busy() || cooldownActive() || !email()"
    (click)="resend()"
  >
    @if (busy()) { Sending… } @else { Didn't get the email? Resend }
  </button>

  <p class="text-sm text-ink-2">
    <a routerLink="/dashboard" class="text-ochre hover:underline">Continue to dashboard</a>
  </p>
</section>
```

- [ ] **Step 3: Run the web-auth tests**

Run: `pnpm nx test web-auth`
Expected: PASS — all existing web-auth specs stay green.

- [ ] **Step 4: Commit**

```bash
git add libs/web-auth/src/lib/register-confirm-page
git commit -m "feat(web-auth): restyle the registration-confirmation page in the design system"
```

---

## Task 5: Restyle the forgot-password page

Restyle task — the existing `forgot-password-page.component.spec.ts` must stay green.

**Files:**
- Modify: `libs/web-auth/src/lib/forgot-password-page/forgot-password-page.component.ts`
- Modify: `libs/web-auth/src/lib/forgot-password-page/forgot-password-page.component.html`

- [ ] **Step 1: Add the design-system imports to the component**

In `libs/web-auth/src/lib/forgot-password-page/forgot-password-page.component.ts`, add near the other imports:
```ts
import { LwButtonDirective, LwInputDirective } from '@learnwren/web-ui';
```
And change the `@Component` `imports` array from:
```ts
  imports: [ReactiveFormsModule, RouterLink],
```
to:
```ts
  imports: [ReactiveFormsModule, RouterLink, LwButtonDirective, LwInputDirective],
```
Make no other change to the file.

- [ ] **Step 2: Rewrite the template**

Replace the entire contents of `libs/web-auth/src/lib/forgot-password-page/forgot-password-page.component.html` with:
```html
<section class="w-full max-w-md space-y-3 rounded-lg border border-line bg-bg-2 p-6">
  <h1 class="text-xl">Reset your password</h1>

  @if (submitted()) {
    <p class="text-sm text-ink-2">
      If an account exists for that address, we've sent reset instructions. Please
      check your inbox.
    </p>
    <p class="text-sm">
      <a routerLink="/login" class="text-ochre hover:underline">Back to sign in</a>
    </p>
  } @else {
    <p class="text-sm text-ink-2">
      Enter your email and we'll send you a link to set a new password.
    </p>
    <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-3">
      <label class="block">
        <span class="text-sm font-medium text-ink-2">Email</span>
        <input
          lwInput
          type="email"
          formControlName="email"
          autocomplete="email"
          class="mt-1"
          required
        />
      </label>
      <button
        lwButton
        variant="primary"
        type="submit"
        class="w-full justify-center disabled:opacity-50"
        [disabled]="form.invalid || busy()"
      >
        @if (busy()) { Sending… } @else { Send reset email }
      </button>
    </form>
    <p class="text-sm">
      <a routerLink="/login" class="text-ochre hover:underline">Cancel</a>
    </p>
  }
</section>
```

- [ ] **Step 3: Run the web-auth tests**

Run: `pnpm nx test web-auth`
Expected: PASS — all existing web-auth specs stay green.

- [ ] **Step 4: Commit**

```bash
git add libs/web-auth/src/lib/forgot-password-page
git commit -m "feat(web-auth): restyle the forgot-password page in the design system"
```

---

## Task 6: Restyle the unlock page

Restyle task — the existing `unlock-page.component.spec.ts` must stay green. This page has no `<input>` or `<button>` elements (only text and `<a routerLink>` links), so **no component `imports` change is needed** — only the template.

**Files:**
- Modify: `libs/web-auth/src/lib/unlock-page/unlock-page.component.html`

- [ ] **Step 1: Rewrite the template**

Replace the entire contents of `libs/web-auth/src/lib/unlock-page/unlock-page.component.html` with:
```html
<section class="w-full max-w-md space-y-3 rounded-lg border border-line bg-bg-2 p-6">
  @switch (state().kind) {
    @case ('pending') {
      <p class="text-sm text-ink-2">Unlocking your account…</p>
    }
    @case ('ok') {
      <h1 class="text-xl">Account unlocked</h1>
      <p class="text-sm text-ink-2">You can sign in now.</p>
      <p>
        <a routerLink="/login" class="text-ochre hover:underline">Continue to sign in</a>
      </p>
    }
    @case ('expired') {
      <h1 class="text-xl">This unlock link has expired</h1>
      <p class="text-sm text-ink-2">
        You can reset your password to regain access.
      </p>
      <p>
        <a routerLink="/forgot-password" class="text-ochre hover:underline"
          >Reset password</a
        >
      </p>
    }
    @case ('invalid') {
      <h1 class="text-xl">This unlock link is invalid</h1>
      <p>
        <a routerLink="/login" class="text-ochre hover:underline">Back to sign in</a>
      </p>
    }
    @case ('error') {
      <p class="text-sm text-bad" role="alert">
        Something went wrong. Please try again or
        <a routerLink="/forgot-password" class="text-ochre hover:underline"
          >reset your password</a
        >.
      </p>
    }
  }
</section>
```

- [ ] **Step 2: Run the web-auth tests**

Run: `pnpm nx test web-auth`
Expected: PASS — all existing web-auth specs stay green.

- [ ] **Step 3: Commit**

```bash
git add libs/web-auth/src/lib/unlock-page
git commit -m "feat(web-auth): restyle the account-unlock page in the design system"
```

---

## Task 7: Sync project references and verify

`web-auth` now imports `@learnwren/web-ui`, so its TypeScript project references must be synced. This task also runs the full verification.

**Files:**
- Modify: `libs/web-auth/tsconfig.lib.json` (via `nx sync` — adds a `web-ui` project reference)

- [ ] **Step 1: Sync TypeScript project references**

Run: `pnpm nx sync`
Expected: it reports updating `libs/web-auth`'s tsconfig to add a reference to `libs/web-ui`. (If `nx sync` reports the workspace is already up to date, that is also acceptable — proceed.)

- [ ] **Step 2: Commit the sync result (only if `nx sync` changed files)**

Run `git status`. If `libs/web-auth/tsconfig.lib.json` (or another tsconfig) was modified:
```bash
git add libs/web-auth/tsconfig.lib.json
git commit -m "chore(web-auth): sync TS project references after wiring web-ui"
```
If `nx sync` changed nothing, skip this commit.

- [ ] **Step 3: Run lint, test, typecheck, and build across the affected projects**

Run: `pnpm nx run-many -t lint test typecheck build --projects=web-ui,web-auth,web`
Expected: all targets PASS. In particular `web-auth`'s five page specs and `web-ui`'s tests are all green, and `web` builds.

- [ ] **Step 4: Browser check**

Start the dev server: `pnpm nx serve web` (wait until it serves on `http://localhost:4200`). Then in a browser:
- Visit `http://localhost:4200/login` — confirm the login card is now a **dark** surface (`bg-bg-2`) on the dark background, with legible warm-white heading and labels, design-styled inputs, and an ochre primary "Sign in" button. No white card, no faint text.
- Visit `/register`, `/forgot-password` — confirm the same dark-card treatment and legible text.
- Confirm form submission still works (the form still posts; errors still display) and there are no console errors.

Stop the dev server when done.

- [ ] **Step 5: No commit**

This task's only commit is the optional sync commit in Step 2. Steps 3–4 are verification only.

---

## Self-Review Notes

- **Spec coverage** (`2026-05-22-design-system-adoption-design.md` §4 Slice 3): all five pages restyled (Tasks 2–6); card surface applied (`bg-bg-2 border border-line rounded-lg`); serif headings (via the global `h1` rule from the foundation); design-styled inputs (the `lwInput` directive, Task 1); `lwButton` on every `<button>` (`primary` for submits, `ghost`/default for secondary buttons); error/locked/unverified logic untouched, recolored to `text-bad` / `text-warn` / `text-good`. The two prose deviations (card classes vs. `<lw-card>` component; `<a>` links styled as ochre text rather than `lwButton`) are documented at the top of this plan.
- **No placeholders:** every template is given in full; every `imports` change shows the exact before/after.
- **Type consistency:** the only new exported symbol is `LwInputDirective` (Task 1), imported by name in Tasks 2, 3, 5; `LwButtonDirective` (already exported by the foundation) is imported in Tasks 2–5. Task 6 (unlock) adds no imports — verified against its template, which has no `<button>`/`<input>`.
- **Out of scope:** restyling `web-courses` and `web-video` pages and the dashboard (Slices 4–5); the `LwPillComponent` missing-`ochre`-tone fix flagged in the foundation's final review (belongs with the Slice 5 video-badge work).
