import { expect, test, type Page } from '@playwright/test';

import { stubAuth, stubJson } from '../_helpers/a11y-stubs';
import {
  CATALOG_LIST,
  CATEGORIES,
  COURSE_CARD,
  COURSE_DETAIL,
  ENROLLMENT_STATUS_NONE,
  LESSON_PAYLOAD_L1,
  LESSON_PAYLOAD_L2,
  NOW,
  REORDER_COURSE_TREE,
} from '../_helpers/a11y-routes';

/**
 * Assert the focused element is a real control AND paints a visible focus
 * indicator. The Robin design-system port touched focus rings, and a control
 * that is focusable but shows no focus state passes every automated axe check
 * while failing WCAG SC 2.4.7.
 *
 * Tightened for Task 6: the original check accepted `boxShadow !== 'none'` as
 * proof of a focus ring. That is foolable by any element carrying a
 * *persistent* shadow — a raised card, a drag-lifted handle — which paints
 * that shadow whether or not it is focused, so the assertion could pass on
 * zero visual change. Journey 4 focuses exactly that kind of element (module
 * drag handles / reorder controls), so the shadow branch is dropped rather
 * than loosened further. This app's real focus mechanism
 * (apps/web/src/styles.scss:33-43) is a `:focus-visible { outline: 2px solid
 * var(--lw-ochre) }` rule with no box-shadow fallback anywhere in the
 * codebase, so requiring a real, non-zero `outline` is not just stricter —
 * it is what the app actually does, and cannot be satisfied by a shadow that
 * is present whether or not the element is focused.
 */
async function expectVisibleFocus(page: Page): Promise<void> {
  const active = page.locator(':focus-visible');
  await expect(active).toHaveCount(1);
  const hasOutline = await active.evaluate((el) => {
    const s = getComputedStyle(el);
    return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
  });
  expect(hasOutline, 'focused element paints no visible outline').toBe(true);
}

/**
 * Press Tab until the predicate matches the focused element, or fail.
 *
 * Accessible-name lookup covers `aria-label`, `aria-labelledby`, and — the
 * case the brief's original `el.textContent` fallback missed entirely —
 * `<label for>`/wrapping-`<label>` association via the DOM `labels`
 * property. Without it, every `<input>` in this app (login email/password,
 * search) is unreachable by name: inputs have no text content of their own,
 * so `el.textContent?.trim()` is always `''` and the loop exhausts its
 * budget even though the field is one Tab away. That's a test-helper gap,
 * not an app defect — the inputs already have real `<label for>` markup
 * (see login-page.component.html:5,9 and :18,22).
 */
async function tabTo(page: Page, accessibleName: RegExp, max = 40): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const name = await page
      .locator(':focus')
      .evaluate((el) => {
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel;
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
          const text = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
            .join(' ')
            .trim();
          if (text) return text;
        }
        const labels = (el as HTMLInputElement).labels;
        if (labels && labels.length > 0) {
          return Array.from(labels)
            .map((label) => label.textContent?.trim() ?? '')
            .join(' ')
            .trim();
        }
        return el.textContent?.trim() ?? el.getAttribute('placeholder') ?? '';
      })
      .catch(() => '');
    if (accessibleName.test(name)) return;
  }
  throw new Error(`never reached a control matching ${accessibleName} within ${max} tabs`);
}

test('journey 1: a user can sign in using only the keyboard', async ({ page }) => {
  await stubAuth(page, 'guest');
  // Wire shape verified against ApiErrorBody, libs/shared-data-models/src/lib/api-error.ts:8-13
  // — every API exception filter nests the code under `error`, not at the
  // top level. Auth.service.ts:~130 reads `err.error?.error?.code`; a flat
  // `{ code, message }` body (as the brief originally had it) silently falls
  // through to the generic INTERNAL branch instead of the INVALID branch.
  await page.route('**/api/auth/login', (route) =>
    void route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
      }),
    }),
  );

  await page.goto('/login');
  // Wait for the real route content before tabbing. This is a lazy-loaded
  // Angular route: `page.goto` resolves on the browser "load" event, which
  // fires once the initial shell script loads — not once the route chunk has
  // been fetched and the component has rendered. Pressing Tab before then
  // lands on nothing focusable (the DOM has no focusable content yet), and
  // since the loop only presses Tab once per iteration and never retries the
  // *first* press, it hangs waiting for a focus target that will never
  // appear. The other a11y specs avoid this via `readySelector`/`expectText`
  // on `A11yRoute` (a11y-routes.ts); this file has no such route table, so
  // the wait is inline here instead.
  await expect(page.getByLabel('Email')).toBeVisible();

  // Reach the email field by keyboard alone and type into it.
  await tabTo(page, /email/i);
  await expectVisibleFocus(page);
  await page.keyboard.type('student@example.com');

  await page.keyboard.press('Tab');
  await expectVisibleFocus(page);
  await page.keyboard.type('Aa1!aaaaaaaa');

  // Wait for the actual submission-eligibility condition, not a sleep: the
  // submit button's `disabled` attribute (bound to `form.invalid`) updates
  // via Angular's asynchronous change detection, which lags the FormControl
  // value update (synchronous, inside the native 'input' handler) by one
  // scheduled CD pass. Pressing Enter immediately after the last keystroke
  // can race ahead of that pass: a browser only performs Enter-triggered
  // implicit form submission when the form's default button is NOT
  // disabled, so while the attribute is still stale, the keypress is a
  // silent no-op — confirmed by repro (see task-7-report.md "Fix round 2"):
  // the button's disabled attribute was still `true` at the instant Enter
  // was pressed in every reproduced failure, then flipped `false` shortly
  // after. A human typing at ordinary speed never lands in that window;
  // this assertion (auto-retrying, no fixed delay) waits for the same
  // condition the browser itself checks before sending Enter.
  await expect(page.getByRole('button', { name: /sign in/i })).toBeEnabled();

  // Submit with Enter from within the form.
  await page.keyboard.press('Enter');

  // The failure must be ANNOUNCED, not merely rendered: it needs a live
  // region (or focus moved to it), or a screen-reader user never learns the
  // submission failed.
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/invalid/i);
});

test('journey 2: a student can go from catalogue to enrolled using only the keyboard', async ({ page }) => {
  await stubAuth(page, 'student');
  await stubJson(page, '**/api/categories', CATEGORIES);
  await stubJson(page, '**/api/catalog**', CATALOG_LIST);
  await stubJson(page, '**/api/catalog/c-1', COURSE_DETAIL);
  await stubJson(page, '**/api/enrollments/c-1', ENROLLMENT_STATUS_NONE);
  await page.route('**/api/enrollments', (route) =>
    void route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ courseId: COURSE_CARD.id, status: 'ACTIVE', enrolledAt: NOW }),
    }),
  );

  await page.goto('/catalog');
  // See journey 1's comment: wait for the lazy route's real content before
  // the first Tab press, or the loop can hang waiting on a focus target that
  // doesn't exist yet.
  await expect(page.getByText(COURSE_CARD.title)).toBeVisible();

  // Reach the course link and activate it with Enter.
  await tabTo(page, new RegExp(COURSE_CARD.title, 'i'));
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/catalog\/c-1/);

  // Focus must not be lost to <body> after client-side navigation — assert
  // it directly. tabTo alone would not catch a regression here: Tab from
  // <body> reaches the same first control as Tab from anywhere earlier in
  // the DOM, so a "focus reset to body" bug would still let tabTo succeed.
  await expect(page.locator('#main-content')).toBeFocused();
  // Course detail is also lazy-loaded — same wait-before-tabbing rationale
  // as journey 1, this time for the client-side (not full-page) navigation.
  await expect(page.getByRole('button', { name: /enrol|enroll/i })).toBeVisible();

  await tabTo(page, /enrol|enroll/i);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');

  await expect(page.getByRole('button', { name: /leave|start learning/i }).first()).toBeVisible();
});

test('journey 3: a student can navigate lessons and mark complete using only the keyboard', async ({ page }) => {
  await stubAuth(page, 'student');
  await stubJson(page, '**/api/playback/config', { impl: 'fake' });
  await stubJson(page, '**/api/learn/courses/c-1/lessons/l-1', LESSON_PAYLOAD_L1);
  await stubJson(page, '**/api/learn/courses/c-1/lessons/l-2', LESSON_PAYLOAD_L2);
  await page.route('**/api/learn/courses/c-1/lessons/l-2/complete', (route) =>
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ completedAt: NOW }),
    }),
  );

  // The outline is a sidebar (always open) at >=1024px. Playwright's default
  // Desktop Chrome viewport is 1280px wide, which would never exercise the
  // drawer at all. Force mobile so the toggle/close path — the highest-risk
  // part of this journey — is actually under test.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/learn/c-1/l-1');
  // Lazy-loaded route: wait for real content before the first Tab press (see
  // journey 1's comment for why). Not "Module 1" — at this mobile viewport
  // the outline starts closed (`[hidden]` on the drawer `<aside>`), so
  // anything inside it is not yet visible; the lesson <h1> lives outside the
  // drawer and always renders.
  await expect(page.getByRole('heading', { name: 'Getting started', level: 1 })).toBeVisible();

  const drawer = page.locator('aside[aria-label="Course outline"]');

  // Open the outline drawer by keyboard and navigate to the second lesson
  // from within it — the part of "navigate lessons" the brief's original
  // test body never actually exercised.
  await tabTo(page, /outline/i);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid="outline-toggle"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(drawer).toBeVisible();

  await tabTo(page, /going further/i);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/learn\/c-1\/l-2/);
  // Task 5's router-driven focus effect (apps/web/src/app/app.ts) moves focus
  // to #main-content on every subsequent navigation — assert it landed
  // there rather than assuming focus stayed wherever it last was.
  await expect(page.locator('#main-content')).toBeFocused();
  // Selecting a lesson from the drawer must also close it.
  await expect(drawer).toBeHidden();

  // Escape must close the drawer once focus has moved inside — an
  // unclosable drawer is a keyboard trap. (Escape while focus stays on the
  // toggle button wouldn't reach the drawer's own keydown.escape handler:
  // the toggle lives outside <lib-course-outline-panel>'s DOM subtree, so
  // the keydown event never bubbles through it. Tabbing into the drawer
  // first is what makes this a real test of the handler rather than a
  // vacuous `toHaveCount(0)` against a `role=dialog` this app never uses —
  // the outline is an inline `<aside>`, not a modal.)
  await tabTo(page, /outline/i);
  await page.keyboard.press('Enter');
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Tab');
  await expectVisibleFocus(page);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  // Mark the current (second) lesson complete by keyboard.
  await tabTo(page, /mark as complete/i);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  // The real "did it work" element, not a substring match over the whole
  // page (lesson-player-page.component.html:88).
  await expect(page.getByTestId('completed-pill')).toBeVisible();
});

test('journey 4: an instructor can reorder modules and lessons using only the keyboard', async ({ page }) => {
  await stubAuth(page, 'instructor');
  await stubJson(page, '**/api/categories', [{ id: 'engineering', name: 'Engineering' }]);
  // GET /api/courses/:cid, not /tree — see COURSE_TREE's comment in
  // a11y-routes.ts; `/tree` does not exist as a route.
  await stubJson(page, '**/api/courses/c-1', REORDER_COURSE_TREE);
  await stubJson(page, '**/api/courses/c-1/publish-eligibility', {
    eligible: false,
    reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }],
  });
  // MaterialsListComponent's constructor effect fetches this unconditionally
  // per lesson (materials-list.component.ts:49-54) for both of m-1's lessons.
  await stubJson(page, '**/api/courses/c-1/modules/m-1/lessons/rl-1/materials', []);
  await stubJson(page, '**/api/courses/c-1/modules/m-1/lessons/rl-2/materials', []);

  let moduleReorderBody: unknown = null;
  await page.route('**/api/courses/c-1/modules/order', async (route) => {
    moduleReorderBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  let lessonReorderBody: unknown = null;
  await page.route('**/api/courses/c-1/modules/m-1/lessons/order', async (route) => {
    lessonReorderBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/courses/c-1/edit');
  await expect(page.getByText('First module')).toBeVisible();

  // Angular CDK's cdkDrag on the module tree is pointer-only: there is no
  // cdkDragHandle, and the drag surface is a plain (non-focusable) <div>, so
  // it was never reachable by Tab and Space/Arrow never did anything — a
  // genuine keyboard trap, not a tab-budget problem. Reach the first
  // module's keyboard "Move down" button instead (added for this task; it
  // routes through the same reorderModules-emitting handler the drag drop
  // event calls).
  await tabTo(page, /move first module down/i);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');

  // Prove the reorder actually persisted: the API call fired with the
  // expected payload, not merely that a button was pressed.
  await expect.poll(() => moduleReorderBody).toEqual({ ids: ['m-2', 'm-1'] });

  // Focus must not be dumped to <body>: "First module" is now last, so its
  // own Move-down button just became disabled and the browser would blur it
  // by default. Its Move-up button (still enabled) must hold focus instead —
  // a keyboard user who just acted needs to still be AT the thing they acted
  // on, not back at the top of the page.
  const focused = page.locator(':focus');
  await expect(focused).toHaveAttribute('data-testid', 'module-move-up');
  await expect(focused).toHaveAttribute('aria-label', 'Move First module up');
  await expectVisibleFocus(page);

  // The reorder must also be ANNOUNCED — a screen-reader user gets no visual
  // cue that anything moved.
  await expect(page.getByTestId('module-reorder-announcement')).toHaveText(
    'First module moved to position 2 of 2',
  );

  // The identical trap existed one level down on the lesson list
  // (lesson-list.component.html) — same fix, same proof. Same cdkDrag on a
  // plain <li>, same "Move up"/"Move down" buttons added by this task.
  await tabTo(page, /move first lesson down/i);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');

  await expect.poll(() => lessonReorderBody).toEqual({ ids: ['rl-2', 'rl-1'] });

  const lessonFocused = page.locator(':focus');
  await expect(lessonFocused).toHaveAttribute('data-testid', 'lesson-move-up');
  await expect(lessonFocused).toHaveAttribute('aria-label', 'Move First lesson up');
  await expectVisibleFocus(page);
  // Scoped to m-1's own lesson list: LessonListComponent is instantiated once
  // per module (m-2 has none, so its own empty live region also matches the
  // bare testid — a strict-mode violation without this scope).
  await expect(
    page.locator('[data-module-id="m-1"]').getByTestId('lesson-reorder-announcement'),
  ).toHaveText('First lesson moved to position 2 of 2');
});
