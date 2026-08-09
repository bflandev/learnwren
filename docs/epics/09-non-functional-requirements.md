> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# EP-09: Non-Functional Requirements

Non-functional requirements define the quality attributes of the system. In Agile, these are often expressed as constraints or as user stories written from the perspective of the platform itself or a technical stakeholder.

---

## US-09-01: Performance

> **As a** Student, **I want** the platform to respond quickly to my actions **so that** my learning experience is not disrupted by slow page loads.

**Acceptance Criteria (Conditions of Satisfaction):**

- All non-video pages must achieve a Time to First Byte (TTFB) of under 500 ms for 95% of requests under normal load. **Deferred 2026-08-08:** verifying this needs a load harness (k6 or equivalent) driving the deployed production API, which a hermetic CI gate cannot do. Measuring it against the Firebase emulators would be worse than not measuring it: emulator throughput has no relationship to production Cloud Functions — no cold starts, no autoscaling, none of Firestore's real latency — so a green emulator result would read as evidence while proving nothing. Closing this criterion requires a load-test pass against production. See `docs/superpowers/specs/2026-08-08-us-09-01-performance-design.md` §7.
- The course catalogue page must load within 2 seconds on a standard broadband connection. **Amended 2026-08-08 — not met:** on the GitHub Actions runner this gate runs on, the catalogue's time-to-content median is 1989 ms against the 2000 ms budget — an 11 ms margin, which is runner noise, not headroom. Time to content sits at roughly the same ~1980 ms figure on every measured content route regardless of that route's payload and does not improve across repeat navigations, which means the cost is dominated by cold production-bundle download over a modelled 10 Mbps link plus Angular bootstrap, not by anything catalogue-specific — closing it needs bundle-weight optimisation, which is outside this slice. `nx run web-e2e:perf` measures and logs the catalogue's time-to-content on every run but does not gate it, for exactly that reason; it does gate the catalogue's Largest Contentful Paint (1424 ms median, real margin against the same 2000 ms budget). See `docs/superpowers/specs/2026-08-08-us-09-01-performance-design.md` §5.
- Video playback must begin within 3 seconds of clicking play on a standard broadband connection. **Gated in CI since 2026-08-08** (`nx run web-e2e:perf`, 260 ms median). Honest limit: hls.js starts fetching and decrypting the manifest, key, and segment as soon as the page mounts (`autoStartLoad` is on by default), so the measured window brackets MSE append, decode, and first paint on an already-buffered segment — not the fetch-decrypt-decode path. That models a user clicking play on a page that finished loading, which is what the criterion describes, but the gate cannot catch a regression in manifest, key, or segment fetch latency. See `docs/superpowers/specs/2026-08-08-us-09-01-performance-design.md` §6.
- The platform must support at least 100 concurrent users without degradation in response time. **Deferred 2026-08-08:** same reason as the TTFB criterion above — this needs a load harness against production, not the emulators.

---

## US-09-02: Security

> **As a** Platform Administrator, **I want** the platform to follow security best practices **so that** user data and course content are protected from unauthorised access.

**Acceptance Criteria (Conditions of Satisfaction):**

- All data in transit must be encrypted using TLS 1.2 or higher (HTTPS enforced site-wide).
- All passwords must be stored as salted hashes using bcrypt, Argon2, or an equivalent algorithm. Plaintext passwords must never be stored.
- Session tokens must be short-lived (max 24 hours) and invalidated upon logout.
- The platform must implement CSRF protection on all state-changing requests.
- Video URLs and DRM license endpoints must be protected by signed, time-limited tokens.
- The platform must pass a basic OWASP Top 10 security review before initial deployment.

---

## US-09-03: Accessibility

> **As a** Student with a disability, **I want** the platform to be accessible **so that** I can learn without barriers.

**Acceptance Criteria (Conditions of Satisfaction):**

- The platform must conform to WCAG 2.1 Level AA guidelines.
- All images must have descriptive `alt` text.
- The video player must support closed captions (WebVTT format).
- The platform must be fully navigable by keyboard alone.
- Colour contrast ratios must meet WCAG 2.1 AA minimums (4.5:1 for normal text, 3:1 for large text).

---

## US-09-04: Open-Source and Self-Hosting

> **As a** Platform Operator, **I want** the platform to be fully open-source and self-hostable **so that** I can run it on my own infrastructure without vendor lock-in.

**Acceptance Criteria (Conditions of Satisfaction):**

- All source code is published under an OSI-approved open-source licence (e.g., AGPL-3.0 or MIT).
- The platform can be deployed using Docker Compose with a single command.
- A comprehensive `README` and deployment guide are provided, covering prerequisites, configuration, and first-run setup.
- The platform does not require any proprietary third-party services to function. All required services (database, object storage, video transcoding, DRM) must have a self-hosted option.
- Configuration is managed via environment variables, with a documented `.env.example` file.

---

## US-09-05: Mobile Responsiveness

> **As a** Student, **I want** to access the platform on my mobile phone or tablet **so that** I can learn on the go.

**Acceptance Criteria (Conditions of Satisfaction):**

- All pages are responsive and render correctly on screen widths from 320 px (small mobile) to 2560 px (large desktop).
- The video player is touch-friendly on mobile devices. **Amended 2026-08-07:** this is satisfied by the native `<video controls>` player, which provides a touch scrubber, tap-to-play, and fullscreen with pinch-zoom on iOS and Android. Custom swipe-to-seek and pinch-to-zoom handlers were considered and declined: layering custom gestures over the native controls would forfeit the keyboard operability and screen-reader labelling those controls provide for free, putting the WCAG 2.1 AA gate landed in US-09-03 at risk. See `docs/superpowers/specs/2026-08-07-us-09-05-mobile-responsiveness-design.md` §6.
- Navigation menus collapse into a hamburger menu on small screens.
- Text is legible without horizontal scrolling on any supported screen width.
