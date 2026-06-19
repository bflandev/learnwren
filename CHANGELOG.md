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
