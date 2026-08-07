> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# US-09-05: Mobile Responsiveness — Slice Design

**Date:** 2026-08-07
**Story:** [US-09-05](../../epics/09-non-functional-requirements.md#us-09-05-mobile-responsiveness) (EP-09, Non-Functional Requirements)
**Status:** Design approved; implementation not started.

---

## 1. Why this slice

Every story in EP-01 through EP-08 is shipped. EP-09 has three open stories:

| Story | Why not this slice |
| :--- | :--- |
| US-09-01 Performance | Needs load-test infrastructure and production measurement; its ACs (TTFB percentiles, 100 concurrent users) cannot be verified against the emulators. Own spec cycle. |
| US-09-04 Self-hosting | The "no proprietary third-party services" AC contradicts the architecture fixed in `TECHNICAL_ARCHITECTURE.md` (Firebase Auth, Firestore, Cloud Storage, GCP Transcoder). Needs an AC renegotiation before it can be designed, not an implementation plan. |
| **US-09-05 Mobile responsiveness** | **This slice.** A real vertical slice that reuses the tooling pattern just landed for US-09-03. |

## 2. Current state

Surveyed 2026-08-07 at `9c8bfc8`.

- **The header does not collapse at all.** `apps/web/src/app/app.html:8` is a single flat flex row with no breakpoints: wordmark, up to seven nav links (four of them admin-only), search bar, theme toggle, avatar, and display name. At 320 px this overflows. There is no hamburger anywhere in the app.
- **Breakpoint coverage across the app libraries is thin.** Counting `sm:`/`md:`/`lg:`/`xl:`/`2xl:` occurrences: `web-auth` 0, `web-profile` 0, `web-enrollment` 0, `web-video` 0, `web-data-table` 0, `web-admin` 1, `web-learn` 2, `web-courses` 3, `web-catalog` 5. Only `web-landing` (16), `web-ui` (18), and `web-design-system` (14) are meaningfully responsive.
- **Two raw tables have no overflow container.** `course-students-page.component.html:38` and `course-analytics-page.component.html:51` are both `<table class="w-full">` inside an `hlm-card`, so a narrow viewport scrolls the page body rather than the table.
- **The video player uses native controls** (`video-player.component.html:2` — `<video controls>`).
- **There is no viewport or responsive testing.** The only files referencing viewports are the two a11y specs.

## 3. Approach

Two pieces, in order.

1. A **responsive gate** (`nx run web-e2e:responsive`) — a hermetic Playwright suite that fails on horizontal overflow across the existing route inventory at four widths.
2. **Layout fixes** for what the gate catches, plus the header collapse.

**The gate lands first and red.** The header and the two bare tables are near-certain defects, but the fix inventory is not pre-declared beyond those: the US-09-03 slice found two defects nobody predicted (an `hlmInput` focus-steal causing real data corruption, and keyboard-inoperable drag-and-drop reorder). Writing the test list from a guess and then confirming the guess is how the third defect gets missed.

## 4. The responsive gate

### 4.1 Reuse the route inventory

`apps/web-e2e/src/_helpers/a11y-routes.ts` already holds 22 field-verified routes with auth stubs, `/api` route stubs, and `expectText` render guards. The responsive suite imports the same `GUEST_ROUTES` and `AUTHED_ROUTES`.

This is the whole reason the slice is small. It also means a route added for one sweep is automatically covered by the other, and there is one fixture set to keep true to `shared-data-models` rather than two that can drift.

**Rename:** `_helpers/a11y-routes.ts` → `_helpers/route-inventory.ts`, and the exported type `A11yRoute` → `RouteFixture`. The file is no longer a11y-specific once two suites consume it. Mechanical rename; no behaviour change.

> The fixtures in this file MUST stay field-verified against `shared-data-models`. A fixture with a wrong or missing field renders an error state, the `expectText` render guard fails, and the route silently stops being covered. This is a known trap from US-09-03.

### 4.2 What is asserted

Per route, per width:

```js
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```

Widths: **320, 768, 1280, 2560** — the two endpoints named in the AC plus the tablet and standard-desktop midpoints. 768 is where a hamburger boundary bug would hide.

That single check is the only acceptance criterion in US-09-05 that is honestly machine-verifiable. "Renders correctly" and "touch-friendly" are subjective; gating on a proxy for them would overstate what CI proves.

### 4.3 Header specs

The other objectively testable AC ("navigation menus collapse into a hamburger menu on small screens") gets targeted specs:

- Below `md`: the hamburger is visible, the nav links are not, the sheet opens, and it contains every link the desktop nav would render for that role.
- At and above `md`: the nav links are visible, the hamburger is not.
- The admin role — seven links, the worst case — is the one exercised at 320 px.

### 4.4 Wiring

- `apps/web-e2e/playwright.responsive.config.ts`, cloned from `playwright.a11y.config.ts`: Angular dev server only, no api, no emulators, explicit 90 s `webServer` timeout.
- A `responsive` target in `apps/web-e2e/project.json` alongside `a11y`.
- CI gates at zero violations, no allowlist.

The a11y config's warning about retries applies here unchanged: a green run after a retry is not the same as a clean first-attempt pass.

### 4.5 What the gate does not prove

Recorded here and in the README, following the precedent US-09-03 set:

- No horizontal overflow is **not** "renders correctly". A page can pass and still be cramped, ugly, or have controls that are hard to hit.
- Touch-target sizing, the player's mobile affordances, and general visual sanity are **verified manually at 320 px**, and are stated as manual.

## 5. Known fixes

### 5.1 Header collapse

`apps/web/src/app/app.html` → extracted to a new component under `apps/web/src/app/shell/`. The template is ~55 lines today and the collapse logic pushes it past what belongs inline in the root template; `shell/` already exists as the home for this.

Below `md`:

```
┌────────────────────────────┐
│ ☰   ⌂ Learn Wren     ◑  ◍ │
└────────────────────────────┘
   sheet: nav links (role-filtered) + search bar
```

- Hamburger and wordmark left; theme toggle and avatar right. These are the two controls a student reaches for on a phone, so they stay one tap away rather than nesting inside the sheet.
- Nav links and the search bar move into an `hlm-sheet` — already in `web-ui`, so no new primitive and no new dependency. Search gets full width in the sheet instead of the ~120 px it would be crushed to in the bar.
- The display-name chip drops below `md`. It is the element that blows the row out, and the avatar already carries the accessible name via `aria-label`.
- At and above `md` the layout is unchanged.

**Accessibility requirements** (the existing a11y gate will fail the work otherwise, which is the point):

- The hamburger carries `aria-expanded` and `aria-controls`.
- Closing the sheet returns focus to the hamburger.
- The avatar keeps its existing `aria-label`.

### 5.2 Table overflow containers

Wrap each of the two tables in `<div class="overflow-x-auto">` so the table scrolls inside its own container rather than the page body. This matches how `web-data-table` already handles it.

Columns are **not** dropped at narrow widths. Hiding columns loses data; a scrollable table is the honest tradeoff.

### 5.3 Learn page

`lesson-player-page.component.html:48` is already `lg:grid lg:grid-cols-[20rem_1fr]`, so it stacks below `lg`, and the outline drawer already handles mobile. Expected to pass; the gate confirms it. No pre-declared change.

### 5.4 Everything else

No fixes are pre-declared for `web-auth`, `web-profile`, `web-enrollment`, or `web-admin` despite their near-zero breakpoint counts. They are mostly single-column forms and cards, which Tailwind handles without breakpoints. The gate decides.

## 6. Epic amendment

US-09-05 currently reads:

> The video player is touch-friendly and supports swipe-to-seek and pinch-to-zoom on mobile devices.

The player uses native `<video controls>`, which on iOS and Android already provides a touch scrubber, tap-to-play, and fullscreen with pinch-zoom. Meeting the gesture sub-clause *literally* means building a custom gesture layer over the native controls — a large lift that would also put the WCAG 2.1 AA gate landed in US-09-03 at risk, because native controls are keyboard-operable and screen-reader-labelled for free and a custom layer is not.

**Decision:** rely on native player affordances. `docs/epics/09-non-functional-requirements.md` is amended to record that the gesture sub-clause is satisfied by the native player rather than by custom handlers, with this reasoning. The epic is amended rather than left claiming behaviour the code does not implement.

## 7. Testing

- The responsive suite is the gate. It **must be shown red** on the header at 320 px before the fix, with the failing output recorded — not asserted to have passed.
- The a11y suite must stay green throughout. The header rewrite touches focus management, which is exactly what that suite guards.
- Unit tests for the new header component: sheet opens and closes, links match the signed-in role, focus returns to the trigger on close.
- Existing `web` unit tests that assert against header markup in the root template need updating.

## 8. Scope cuts

Stated rather than silently dropped.

- **No custom player gestures.** See §6.
- **No screen-reader pass and no real-device pass.** Same honest-scope framing as US-09-03.
- **No visual-regression / screenshot testing.** It is the obvious answer to "renders correctly" and is deliberately declined: snapshot suites over 22 routes × 4 widths are a large, flaky maintenance surface, and every theme or copy change churns them.
- **Touch-target sizing is verified manually, not gated.** WCAG 2.5.5 is Level AAA and therefore outside the AA gate already running; adding a bespoke size assertion would invent a rule with no specification behind it.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| The rename of `a11y-routes.ts` touches the suite landed three commits ago. | Mechanical rename with no behaviour change; the a11y suite must be green before and after. |
| A fixture drifts from `shared-data-models` and a route silently stops being covered. | The `expectText` render guard already fails loudly on this. Do not relax it. |
| The overflow check passes on a page that is still unusable at 320 px. | Acknowledged in §4.5; covered by manual verification, not claimed by CI. |
| Retry-masking hides an intermittent failure behind a green check. | Inherited warning from the a11y config; treat repeated CI retries as a signal to investigate. |
