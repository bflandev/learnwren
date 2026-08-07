# US-09-03 — Accessibility: Design

> [!NOTE]
> DOCUMENT STATUS: DRAFT

**Date:** 2026-08-07
**Story:** `docs/epics/09-non-functional-requirements.md` § US-09-03 (Accessibility).
**Approach:** two-tier axe-core sweep (design-system page first, then every route) gated at zero WCAG 2.1 AA violations, plus four keyboard-only journey specs. Approved over automated-only (leaves "navigable by keyboard alone" unverified) and over adding a manual screen-reader pass (cannot be regression-gated).

## 1. Goal

Every written story across EP-01–EP-08 is shipped. EP-09 is the only epic with unbuilt stories, and US-09-03 is the first slice against it. US-09-05 (mobile responsiveness) and US-09-01 (performance) follow as Slices B and C.

Today the repo has **no accessibility tooling of any kind** — no axe, no Lighthouse, no pa11y. Every US-09-03 acceptance criterion is an unmeasured claim. This slice makes them measured and keeps them measured.

The Robin design-system port (merge `6a76904`) rewrote the entire visual layer and nothing has re-validated accessibility since, so the timing is deliberate.

## 2. AC coverage and deviations (deliberate)

| AC | How this slice satisfies it |
|---|---|
| Conform to WCAG 2.1 Level AA | Automated axe sweep at `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa`, gated at zero, plus targeted keyboard specs |
| All images have descriptive `alt` text | Verified **present and non-empty**. No automated check can judge whether alt text is *descriptive* — this is a deliberate, stated limit |
| Video player supports WebVTT captions | **Already shipped** 2026-05-30 (lesson captions). No work in this slice |
| Fully navigable by keyboard alone | Four keyboard-only journey specs (§5) |
| Contrast ratios meet AA minimums | Covered by the axe sweep (`color-contrast` rule) |

**The honest limit, stated up front:** automated tooling catches roughly a third to a half of WCAG issues. This slice delivers *automated conformance plus targeted manual verification* — not a certified audit. Documentation must say so in those words rather than claiming bare "WCAG 2.1 AA conformance".

**Why no `best-practice` tag.** axe's `best-practice` ruleset ships opinions, not conformance requirements. Including it would inflate the violation count with items the AC does not require and dilute a gate that is only credible if every entry in it is genuinely mandatory.

## 3. Architecture

Rides the existing `web-e2e` harness: same emulator seeding, same `webServer` block, same auth flows the 18 existing specs already use. No new app, no new Playwright config, no new CI job beyond a target.

**New dependency:** `@axe-core/playwright` (dev).

**New files:**

```
apps/web-e2e/src/
├── _helpers/
│   ├── a11y-routes.ts      # the route inventory table (§4)
│   └── a11y-scan.ts        # thin axe wrapper: AA tags, violation formatting
├── a11y-showcase.spec.ts   # Tier 1 — design-system components
├── a11y-routes.spec.ts     # Tier 2 — every real surface
└── a11y-keyboard.spec.ts   # four keyboard-only journeys
```

`a11y-scan.ts` is the single place the AA tag list is configured, so the gate's definition lives in one file rather than being copy-pasted per spec.

### The two tiers

**Tier 1 — component sweep.** `/showcase` is a dev-only, guard-free, unlinked route (`apps/web/src/app/showcase/`) that renders *every* hlm design-system primitive on one page. Sweeping it catches component-level violations at their source, once. Fixes land in `libs/web-ui` / `libs/web-design-system` and disappear across every consuming surface simultaneously.

**Tier 2 — route sweep.** axe against every real surface in its real authenticated state. Catches only what appears in composition: heading order, landmark structure, form labelling, live-region announcements, focus management across client-side navigation.

**Tier 1 must run and reach zero before Tier 2 is triaged.** Otherwise the same missing `aria-label` is counted and hand-fixed on a dozen routes.

## 4. Route inventory

One exported table in `_helpers/a11y-routes.ts`; each entry names the path, the role required, and any seed setup. The Tier 2 spec iterates it.

| Role | Routes |
|---|---|
| Guest | `/`, `/login`, `/register`, `/register/confirm`, `/forgot-password`, `/auth/unlock`, `/catalog`, `/catalog/:id`, `/search` |
| Student | `/dashboard`, `/learn/:courseId/:lessonId` (twice — see below), `/settings/profile`, `/settings/profile/email-changed` |
| Instructor | `/courses`, `/courses/new`, `/courses/:id/edit`, `/courses/:id/students`, `/courses/:id/analytics` |
| Admin | `/admin/instructor-applications`, `/admin/users`, `/admin/users/:uid`, `/admin/categories`, `/admin/health` |

Notes on the table:

- **There is no separate lesson-editor route.** Lesson editing lives inside `/courses/:id/edit`, so that entry must be scanned in two states: the module/lesson list, and with a lesson's edit panel open (it carries the video upload, caption upload, and materials controls — the densest interactive surface in the app).
- **The learn page is scanned twice** — with the outline drawer closed and open — because the drawer is a distinct interactive surface with its own focus-trap obligations.
- `/admin` alone only redirects to `/admin/instructor-applications` and needs no separate scan.
- `/showcase` is not in this table; it is Tier 1.

## 5. Keyboard journeys

axe checks that elements *are* focusable; it cannot prove a journey *works*. Four specs, each driving only `Tab` / `Shift+Tab` / `Enter` / `Space` / `Escape` / arrow keys. **No `click()` calls.**

1. **Sign in** — reach and submit the login form; a validation error is announced (focus moves to it, or it occupies a live region).
2. **Discover and enrol** — catalog → apply a filter → open course detail → Enrol.
3. **Learn** — open the outline drawer, move between lessons, mark a lesson complete; confirm focus lands somewhere sensible after client-side navigation rather than resetting to `<body>`.
4. **Course editor drag-and-drop reorder** — move a module and a lesson by keyboard.

Every spec asserts a **visible focus indicator** at each stop. The DS port touched focus rings, and a control that is focusable but has no visible focus state fails AA (SC 2.4.7) while passing every automated check.

**Known risk — journey 4.** Pointer-driven drag-and-drop is the classic keyboard trap. If Angular CDK's keyboard reorder is not wired on the module/lesson lists, this spec fails and the fix is real interaction work, not a label. This is the single largest unknown in the slice.

## 6. The gate

A new `a11y` target on `web-e2e` running the three specs, added to CI alongside the existing e2e job.

**Zero AA violations. No allowlist file.** An allowlist is where accessibility debt goes to be forgotten. A genuine false positive gets a scoped `disableRules` at the single assertion with a comment naming why — the same discipline the repo already applies to annotated Stryker equivalents.

**Accepted cost:** a future component change can fail CI for a real-but-minor reason. That is the point, and it is the same trade the repo already made with the CI-enforced 80-adjusted mutation gate.

## 7. Sequencing

1. Wire `@axe-core/playwright`, `a11y-scan.ts`, and the route table. **No fixes.**
2. Run Tier 1. Fix in `web-ui` / `web-design-system`. Re-run to zero.
3. Run Tier 2. Triage survivors, fix per-surface.
4. Add the four keyboard specs. Expect failures; fix them.
5. Wire the CI target; update `README.md` and `docs/USER_GUIDE.md`.

## 8. Expected fix categories

In rough descending likelihood:

- Unlabelled icon-only buttons (the DS port swapped in `hlm` buttons; icon buttons are the usual casualty)
- Missing `alt` on cover images and avatars
- Heading-order jumps from composed page sections
- Form controls associated by placeholder rather than `<label>`
- Colour contrast on muted / secondary text tokens
- Missing `<main>` and landmark structure in the app shell

**Contrast needs a flag.** `libs/web-design-system` already carries a `contrast-core` module with contrast guards, so the `--lw-*` tokens may well pass. If one does fail 4.5:1, the fix is a **token value change**, which shifts the visual design the port just landed. Policy: fix the token rather than exempt the rule, and surface the change explicitly for review rather than quietly restyling.

## 9. Testing and regression risk

The sweep *is* the test — no unit tests for a test harness.

The real risk is collateral: any `aria-label` or DOM-structure change can break Playwright selectors in the 18 existing web-e2e specs, and `web-ui` component tests assert rendered markup.

- Full `nx affected` (lint, test, typecheck, e2e) before merge.
- A Stryker round on any `web-ui` component whose **logic** changes — markup-only edits do not warrant one. The repo standard is 100% on the ds-port libs.
- `nx typecheck web` if any route or lib import changes (only that target catches a missing `apps/web/tsconfig.spec.json` reference).

## 10. Scope cuts

Deliberately excluded from this slice:

- **Screen-reader pass** (VoiceOver / NVDA) — cannot be regression-gated; a candidate for a later slice.
- **Mobile and responsive work** — that is US-09-05, Slice B.
- **`prefers-reduced-motion` audit** — not named by the AC.
- **Accessibility statement page** — not named by the AC.
- **Multi-language captions** — an existing, separate deferred item.

## 11. Branch

Feature work in a git worktree created from local `HEAD`, landed via a local `--no-ff` merge to `main`. `node_modules` symlinked to the parent; files added explicitly, never `git add -A`.
