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
- The course catalogue page must load within 2 seconds on a standard broadband connection. **Met and gated since 2026-10-08.** First measured 2026-08-08 at a 1989 ms time-to-content median on CI against the 2000 ms budget — not met, and left ungated because the margin was runner noise. The cause was bundle weight, not the catalogue: hls.js (~500 KB) was statically reachable from the initial bundle through the library barrels, so every route paid for the video player on first load. Loading hls.js on demand cut the initial bundle from 1.23 MB to ~710 KB and the catalogue's time-to-content to ~1620 ms (local measurement; budgets were historically 10–100 ms higher on the CI runner). `nx run web-e2e:perf` now gates both the catalogue's Largest Contentful Paint and its time-to-content at 2000 ms, and the production build's `initial` bundle budget (800 KB warn / 900 KB error) fails the build if hls.js slips back into the initial bundle. See `docs/superpowers/specs/2026-08-08-us-09-01-performance-design.md` §5.
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
- The platform can be deployed using Docker Compose with a single command. *(Met 2026-09-25: `docker compose up -d`.)*
- A comprehensive `README` and deployment guide are provided, covering prerequisites, configuration, and first-run setup. *(Met 2026-09-25: `docs/self-hosting.md`.)*
- The platform does not require any proprietary third-party services to function. All required services (database, object storage, video transcoding, DRM) must have a self-hosted option.
  **Amended 2026-09-26 (Slices A+B+C):** partially met. The Docker Compose stack runs with no cloud account or credentials. Video transcoding (AES-128 HLS via ffmpeg, in-process) and playback (segments proxied through the api) are real and self-hosted (Slice B); every stored file — video sources and HLS output, lesson materials, cover images, profile pictures — lives in an S3-compatible object store (RustFS in the stack; any S3-compatible store) behind the `ObjectStorage` port, with uploads and downloads passing through the api (Slice C). Firebase Auth and Firestore still run in the Firebase Emulator Suite — a development tool with no authentication and single-process durability — so the auth and data layer is the remaining gap; replacing it needs a `TECHNICAL_ARCHITECTURE.md` update first. See `docs/superpowers/specs/2026-09-25-us-09-04-self-hosting-design.md` §4, `2026-09-25-us-09-04-slice-b-ffmpeg-video-design.md`, and `2026-09-26-us-09-04-slice-c-object-storage-design.md`.
  **Amended 2026-10-02 (Slices A–D): met.** The Docker Compose stack now runs entirely on self-hosted services, with no cloud account, credentials or Firebase emulator: PostgreSQL holds accounts and course data behind the `DocumentStore` port (D2); built-in identity (scrypt passwords, sessions, emailed links) replaces Firebase Authentication behind the `IdentityProvider` port (D3a, D3b); an S3-compatible store (RustFS) holds every file (Slice C); ffmpeg transcodes to AES-128 HLS (Slice B). D3c switched Compose to Postgres and local identity, added the `LEARNWREN_BOOTSTRAP_ADMIN_EMAIL` first-admin flow, and runs api-e2e on both backends in CI. Verified by `docker/smoke.sh` end to end (register, verify, reset, admin login, upload, ffmpeg transcode, encrypted playback). Cloud hosting (Firebase, Firestore, GCP Transcoder) stays an option behind the same ports. No data migrates from the old emulator-based Compose install. See `docs/self-hosting.md` and `docs/superpowers/specs/2026-10-01-us-09-04-slice-d-auth-and-data-design.md`.
- Configuration is managed via environment variables, with a documented `.env.example` file. *(Met 2026-09-25.)*

---

## US-09-05: Mobile Responsiveness

> **As a** Student, **I want** to access the platform on my mobile phone or tablet **so that** I can learn on the go.

**Acceptance Criteria (Conditions of Satisfaction):**

- All pages are responsive and render correctly on screen widths from 320 px (small mobile) to 2560 px (large desktop).
- The video player is touch-friendly on mobile devices. **Amended 2026-08-07:** this is satisfied by the native `<video controls>` player, which provides a touch scrubber, tap-to-play, and fullscreen with pinch-zoom on iOS and Android. Custom swipe-to-seek and pinch-to-zoom handlers were considered and declined: layering custom gestures over the native controls would forfeit the keyboard operability and screen-reader labelling those controls provide for free, putting the WCAG 2.1 AA gate landed in US-09-03 at risk. See `docs/superpowers/specs/2026-08-07-us-09-05-mobile-responsiveness-design.md` §6.
- Navigation menus collapse into a hamburger menu on small screens.
- Text is legible without horizontal scrolling on any supported screen width.
