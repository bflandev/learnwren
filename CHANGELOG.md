## 1.1.0 (2026-06-19)

### 🚀 Features

- **web-landing:** scaffold lib and typed marketing content model ([7a685ca](https://github.com/bflandev/learnwren/commit/7a685ca))
- **web-landing:** add landingGuard redirecting authed users to /dashboard ([4040f2f](https://github.com/bflandev/learnwren/commit/4040f2f))
- **web-landing:** add hero section ([8c9aac3](https://github.com/bflandev/learnwren/commit/8c9aac3))
- **web-landing:** add stats section ([7118988](https://github.com/bflandev/learnwren/commit/7118988))
- **web-landing:** add featured-courses shelf section ([2711225](https://github.com/bflandev/learnwren/commit/2711225))
- **web-landing:** add how-it-works and features sections ([99e3764](https://github.com/bflandev/learnwren/commit/99e3764))
- **web-landing:** add testimonial and pricing sections ([239b822](https://github.com/bflandev/learnwren/commit/239b822))
- **web-landing:** assemble landing page and serve it at / ([cf7debc](https://github.com/bflandev/learnwren/commit/cf7debc))

### 🩹 Fixes

- reference web-landing for web:typecheck ([28a79cf](https://github.com/bflandev/learnwren/commit/28a79cf))
- **prod-readiness:** sweep up review-swarm minor findings ([5fe6c93](https://github.com/bflandev/learnwren/commit/5fe6c93))
- **web:** reference web-landing in apps/web tsconfig.spec.json ([763d609](https://github.com/bflandev/learnwren/commit/763d609))
- **web-landing:** keep the landing page resilient to a failed session refresh ([ccad38f](https://github.com/bflandev/learnwren/commit/ccad38f))

### ❤️ Thank You

- Brian Flanagan
- Claude Opus 4.8 (1M context)

# 1.0.0 (2026-06-19)

Initial public release of **Learn Wren** — a self-hosted, open-source educational video platform with DRM-protected playback, deployed live at https://learnwren.com.

### 🚀 Features

- **Identity & access** — registration with email-verification gate, login/logout, brute-force lockout with email unlock, logged-out password reset, session cookies, and role-based access control (Student, Instructor, Admin). Self-service profile editing (display name, biography, avatar), email change, and password change.
- **Course authoring** — instructors create and structure courses into modules and lessons, upload cover images, and publish behind an eligibility gate.
- **Video & DRM** — video upload, a GCP Transcoder pipeline producing AES-128-encrypted HLS, and protected adaptive playback (hls.js / native Safari) with WebVTT captions.
- **Lesson materials** — attach and securely deliver downloadable supplementary materials to enrolled students.
- **Discovery & enrollment** — public course catalog, course detail pages, and student enrollment.
- **Learning experience** — lesson player with progress tracking, mark-complete, resume-where-you-left-off, and a course outline panel.
- **Instructor dashboard** — enrolled-student roster with CSV export, course analytics, and new-module notifications.
- **Administration** — instructor-application review, a searchable user directory, and role management (promote/demote, suspend, delete + anonymise).
- **Production deployment** — Firebase Hosting + gen2 Cloud Functions, Firestore, Cloud Storage, custom domain, security headers, and a `pnpm deploy` runbook.

### 🔒 Quality & Hardening

- All 15 libraries under CI-enforced mutation testing (≥ 80% adjusted), an OWASP pre-deploy security review, and multi-agent review passes.

### ❤️ Thank You

- Brian Flanagan
- Claude Opus 4.8 (1M context)
