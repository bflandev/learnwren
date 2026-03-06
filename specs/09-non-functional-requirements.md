> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# EP-09: Non-Functional Requirements

Non-functional requirements define the quality attributes of the system. In Agile, these are often expressed as constraints or as user stories written from the perspective of the platform itself or a technical stakeholder.

---

## US-09-01: Performance

> **As a** Student, **I want** the platform to respond quickly to my actions **so that** my learning experience is not disrupted by slow page loads.

**Acceptance Criteria (Conditions of Satisfaction):**

- All non-video pages must achieve a Time to First Byte (TTFB) of under 500 ms for 95% of requests under normal load.
- The course catalogue page must load within 2 seconds on a standard broadband connection.
- Video playback must begin within 3 seconds of clicking play on a standard broadband connection.
- The platform must support at least 100 concurrent users without degradation in response time.

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
- The video player is touch-friendly and supports swipe-to-seek and pinch-to-zoom on mobile devices.
- Navigation menus collapse into a hamburger menu on small screens.
- Text is legible without horizontal scrolling on any supported screen width.
