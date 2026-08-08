# US-09-05 manual verification at 320 px

> [!NOTE]
> DOCUMENT STATUS: DRAFT

## Method

**This is not a human on a physical device.** It was produced by headless
Chromium (Playwright), driven at a 320×640 viewport, against `pnpm exec ng
serve web --port 4266` running the code at commit
`a09a98f315973bd6a34380bd4622b4fdb0a83afd` (branch
`feat/us-09-05-mobile-responsive`), on 2026-08-08.

Every route was driven through the same hermetic stubbing the CI gate uses —
`stubAuth` and the `GUEST_ROUTES` / `AUTHED_ROUTES` fixtures from
`apps/web-e2e/src/_helpers/route-stubs.ts` and `route-inventory.ts` — so the
content scanned here is the same content the overflow gate scans, not a
hand-typed approximation of it. Two throwaway scripts drove the browser
(`measure-320.ts`, `journeys-320.ts`); neither is part of this repo and
neither was committed. Screenshots were written to
`.superpowers/sdd/2026-08-07-us-09-05-mobile-responsiveness/screens/` (also
not committed).

All 22 routes in the inventory (9 guest, 13 authenticated across
student/instructor/admin) loaded successfully at 320×640 with their real
stubbed content (not an error state — same `expectText` guard the gate
uses).

Chromium's built-in `<video controls>` chrome was used to check the player.
It renders desktop-style controls, not iOS/Android native controls, which is
exactly why §"NOT verified" below treats real touch playback as a separate,
unverified claim.

## What passed

- **Guest journey affordances render at 320 px**: landing, catalogue,
  search results, and course detail all loaded with real content, no
  horizontal overflow (already gated), and no broken layout beyond what's
  noted below.
- **Hamburger sheet (admin role)**: `header-nav-toggle` opens
  `header-nav-sheet`; the sheet lists 6 nav items for an admin — *Browse
  courses, Dashboard, Admin, Users, Categories, Health* — all reachable.
  Escape closes the sheet and returns focus to the trigger
  (`header-nav-toggle`), confirmed programmatically via
  `document.activeElement`.
  - Note: the task brief describes "all seven links" for the admin sheet.
    The actual count observed is **6**. Worth a sentence, not a fix — this
    is a doc/brief discrepancy, not an app defect; the brief's route table
    doesn't itemize the nav, and this record now supersedes that guess with
    a machine-measured count.
- **Learn page outline drawer**: the outline (`aside[aria-label="Course
  outline"]`) is visible on first paint at 320 px — confirming the fix in
  commit `2635de9` ("the lesson outline starts open on every viewport, not
  just desktop") held. Clicking an outline row (`outline-row`) closes the
  outline afterward, confirmed by re-checking `isVisible()` on the same
  locator.
- **Video player at 320 px**: with a lesson fixture forced into
  `videoState: 'READY'` + a non-null `videoId` (neither `LESSON_PAYLOAD` nor
  `LESSON_PAYLOAD_L1`/`L2` in the inventory reach this state — their
  `lesson.videoId` stays `null`, which renders the "processing" placeholder,
  not the player, so a custom fixture was needed to see the player at all),
  the `<video controls>` element renders at 320×150, with the `controls`
  attribute present, entirely inside the 320 px viewport (not clipped
  right or left). Screenshot:
  `screens/student-learn-page-player-ready.png`. The native control strip
  (play, elapsed time, volume, fullscreen, overflow menu) is visually
  legible and not overlapping at this width.
- **Roster and analytics tables scroll inside their own container**: on
  `/courses/c-1/students`, `document.documentElement.scrollWidth ===
  clientWidth === 320` (the page body does not scroll), while the
  `.overflow-x-auto` wrapper around the `<table>` does have `scrollWidth >
  clientWidth` — confirming the table scrolls internally, not the page.
  Confirmed programmatically, and matches commit `aa2a316` ("scroll the
  roster and analytics tables inside their own container").
- **Catalogue → course card is visible and tappable at 320 px** (guest
  browse-flow smoke check).

## Cramped but passing

None of these fail the overflow gate — that's the point of this record.

1. **Student roster table, `/courses/c-1/students`**: the "Progress" column
   header is visually truncated to "Progres" in the screenshot at 320 px —
   the fourth column doesn't have room for its own header text even though
   the table itself scrolls correctly inside its wrapper. The name and
   email columns sit close enough to read as touching in the same
   screenshot ("Sam Student" / "student@example.com" have almost no gutter
   between them).
2. **Course analytics table, `/courses/c-1/analytics`**: same pattern — the
   "Duration" column header is visually clipped at the card's right edge.
   Both tables share one root cause: four fixed-content columns inside a
   scrollable wrapper that's itself capped to the 320 px card width, so the
   *headers* don't get the same horizontal room the *scrolling* body does.
3. **Course editor, `/courses/c-1/edit`**: the module and lesson reorder
   arrows (`module-move-up/down`, `lesson-move-up/down`, all 33×32 px) sit
   in a narrow, isolated left-hand column, visually disconnected from the
   module/lesson content they act on — at 320 px there's no label or
   grouping tying the arrow column to its target row, just proximity. The
   page overall reads as a long, dense stack (course details → cover image
   → modules → each module's lessons → each lesson's materials) with very
   little visual breathing room between sections — nothing overflows, but
   it's a page that will feel like a lot of scrolling on a real device.
4. **Login/register/forgot-password secondary links** ("Sign in", "Cancel",
   "Register", "Forgot password?") are plain inline text links with no
   button padding — visually fine, but see the touch-target section below;
   they're the smallest targets found anywhere in the sweep.

## Touch-target measurements

WCAG 2.5.5 (Target Size, 44×44 CSS px) is **Level AAA** and is deliberately
**outside** this project's AA gate (per US-09-05 spec §4.5 and this task's
brief). Nothing below is a proposal to fail the build — it's what a
headless measurement pass actually saw, recorded so the risk isn't silently
retired.

**Method**: for every route in the inventory, at 320×640, every
`button, a, input, select, textarea, [role="button"], [tabindex]` was
measured via `getBoundingClientRect()` (Playwright `boundingBox()`). 181
elements across the 22 routes had width or height under 44 px. Of those, 23
were the "Skip to content" skip-link (offscreen until keyboard-focused, by
design — not a real tap target at rest) and 4 were `sr-only` `<input
type="file">` elements that exist only to be triggered by a visible,
correctly-sized label/button next to them (e.g.
`course-cover-uploader.component.html`, `captions-panel.component.html`).
Excluding both leaves **154 real sub-44px measurements across 86 unique
element patterns**.

**The dominant pattern, by far**: the vast majority of the app's buttons and
form inputs — every `hlmBtn` at its default size, every text input, every
select — render at **36 px tall**. This is not a handful of stray outliers;
it's the design system's default control height, seen on nearly every route
in the sweep (login/register submit buttons, "Add module", "Publish",
"Export CSV", "Save", the theme toggle, the hamburger trigger itself, and
dozens more). 36 px is 8 px short of the AAA target on the vertical axis
only — widths are generally comfortable.

**Worst offenders** (smallest by both dimensions, real interactive
elements, not skip-links or hidden file inputs):

| Size | Element | Route |
|---|---|---|
| 39×17 | `<a>` "Sign in" | register (link to /login) |
| 41×17 | `<a>` "Cancel" | forgot password |
| 49×17 | `<a>` "Register" | login |
| 32×32 | avatar link (`aria-label="Profile settings for …"`) | every authenticated route (14 occurrences) |
| 33×32 | module/lesson reorder arrows (↑/↓, 4 buttons) | course editor |
| 36×36 | theme toggle button | every route (18 occurrences) |
| 40×36 | hamburger trigger (`header-nav-toggle`) | every route below `md` (18 occurrences) |
| 31×36 | pagination "Go to page 1" | admin user directory |

The **39×17 "Sign in" link** on the register page is the single worst
offender by area — a bare text link with no button padding, 27 px short of
44 on the vertical axis and 5 px short on the horizontal.

Full raw data (all 154 entries, unfiltered) is not reproduced here to keep
this record readable; it was written to `/tmp/touch-targets.json` during the
run and is not preserved anywhere durable — re-run the throwaway script
against this commit to regenerate it if a fuller audit is wanted later.

## NOT verified — requires a human on a physical device

The following are outside what a headless Chromium run can prove, full
stop, regardless of how the script is written:

- **Real touch scrubber drag** on the video player's seek bar (finger-drag
  gesture semantics, not a mouse `mousedown`/`mousemove`/`mouseup`
  simulation).
- **Pinch-zoom** behavior on any page (viewport meta tag can be inspected,
  but the actual pinch gesture and its interaction with the fixed header
  cannot be exercised headlessly).
- **Fullscreen engage** on the video player via the native control's
  fullscreen button, on iOS Safari and Android Chrome specifically — each
  has different fullscreen affordances and restrictions (iOS Safari
  historically requires `playsinline` handling and has its own fullscreen
  UI entirely).
- **Actual finger-size ergonomics** — the touch-target numbers above are
  geometric measurements, not a judgment about whether a real thumb can hit
  a 36 px-tall button reliably; that requires a person with a hand.
- **Screen-reader behavior on a physical device** (VoiceOver on iOS,
  TalkBack on Android) — this slice never claimed to cover that (US-09-03
  covers desktop/automated a11y; mobile screen-reader gesture navigation is
  a different surface entirely and untested here).
- **Real network conditions** — 3G/4G throttling, connection drops mid
  playback, and how the player's error/retry UI behaves under them.
- **On-screen keyboard interaction** — how the mobile OS keyboard resizes
  the viewport and whether any input is left obscured behind it (course
  title field, login form, etc.) — headless Chromium has no on-screen
  keyboard to trigger this with.
- **Tap-to-play** and other single-tap gesture semantics on the native
  video element specifically (distinct from the scrubber-drag item above).

## Deferred with reasons

- **36 px button height across the design system** — not fixed here. It's
  a Level AAA observation (WCAG 2.5.5), explicitly out of scope for this
  slice's AA gate per spec §4.5, and changing the design system's default
  control height is a cross-cutting change far larger than a mobile-
  responsiveness verification task. Flagged for a future accessibility
  slice to pick up deliberately, not silently absorbed here.
- **Roster/analytics table header truncation** ("Progres", clipped
  "Duration") — not fixed here. It passes the overflow gate (the *table*
  scrolls, the *page* doesn't) and is a narrow CSS/column-width tweak, not
  a structural defect; recorded as a real, specific finding per the task's
  instructions rather than fixed opportunistically outside its own slice.
- **Course editor's disconnected reorder-arrow column** — not fixed here,
  same reason: a layout finding for a future pass, not a horizontal-scroll
  defect this gate is meant to catch.
- **"Seven links" vs. 6 actual admin sheet links** — not a defect at all;
  this record corrects the brief's assumption with a measured count rather
  than silently reproducing it.
