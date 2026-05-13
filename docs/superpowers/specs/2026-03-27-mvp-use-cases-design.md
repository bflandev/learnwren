# MVP Use Cases Design Spec

## Overview

This document defines the use case specification for the Learn Wren MVP. Use cases are written in fully-dressed Cockburn style and cover the core content creation and consumption loop: user identity, course authoring, video management with DRM, lesson materials, course discovery and enrollment, and the learning experience.

## MVP Scope

The MVP includes 6 epics (EP-01 through EP-06) delivering 24 Cockburn use cases. This scope enables:

- Users to register, log in, and manage profiles
- Instructors to create, structure, and publish video courses with materials
- Videos to be uploaded, transcoded, and DRM-encrypted
- Students to discover, enrol in, and consume courses with DRM-protected playback
- Students to track progress and resume learning

Deferred to post-MVP: Instructor Dashboard (EP-07), Platform Administration (EP-08), and Non-Functional Requirements polish (EP-09).

## Actors

| Actor | Description |
|---|---|
| Guest | Unauthenticated visitor browsing public-facing pages |
| Student | Authenticated user enrolled in one or more courses |
| Instructor | Authenticated user with permission to create and publish courses |
| Administrator | Privileged user responsible for platform configuration and moderation |
| System | The Learn Wren platform acting autonomously (e.g., transcoding, encryption) |

## Use Case Inventory

### EP-01: User Identity and Access

| ID | Use Case | Primary Actor | Level |
|---|---|---|---|
| UC-01-01 | Register a New Account | Guest | Primary Task |
| UC-01-02 | Log In to the Platform | Guest | Primary Task |
| UC-01-03 | Manage User Profile | Student/Instructor | Primary Task |
| UC-01-04 | Request Instructor Role | Student | Primary Task |

### EP-02: Course Authoring

| ID | Use Case | Primary Actor | Level |
|---|---|---|---|
| UC-02-01 | Create a New Course | Instructor | Primary Task |
| UC-02-02 | Add and Manage Modules | Instructor | Primary Task |
| UC-02-03 | Add and Manage Lessons | Instructor | Primary Task |
| UC-02-04 | Publish or Unpublish a Course | Instructor | Primary Task |

### EP-03: Video Management and DRM

| ID | Use Case | Primary Actor | Level |
|---|---|---|---|
| UC-03-01 | Upload a Video to a Lesson | Instructor | Primary Task |
| UC-03-02 | Transcode an Uploaded Video | System | Subfunction |
| UC-03-03 | Encrypt Video with DRM | System | Subfunction |
| UC-03-04 | Play a DRM-Protected Video | Student | Primary Task |
| UC-03-05 | Manage Video Storage | Administrator | Primary Task |

> **Note on UC-03-03 / UC-03-04 in MVP:** Both use cases remain in MVP, but ship with a reduced DRM bar: AES-128 HLS segment encryption, no commercial DRM (Widevine / PlayReady / FairPlay), no license server. The full multi-DRM realisation of these use cases is deferred to a post-MVP slice. See [`2026-05-13-video-pipeline-architecture-design.md`](./2026-05-13-video-pipeline-architecture-design.md) §6 for the protection-claim breakdown.

### EP-04: Lesson Materials

| ID | Use Case | Primary Actor | Level |
|---|---|---|---|
| UC-04-01 | Attach Materials to a Lesson | Instructor | Primary Task |
| UC-04-02 | Download Lesson Materials | Student | Primary Task |

### EP-05: Course Discovery and Enrollment

| ID | Use Case | Primary Actor | Level |
|---|---|---|---|
| UC-05-01 | Browse the Course Catalogue | Guest/Student | Primary Task |
| UC-05-02 | Search for Courses | Guest/Student | Primary Task |
| UC-05-03 | View a Course Detail Page | Guest/Student | Primary Task |
| UC-05-04 | Enrol in a Course | Student | Primary Task |
| UC-05-05 | Unenrol from a Course | Student | Primary Task |

### EP-06: Learning Experience

| ID | Use Case | Primary Actor | Level |
|---|---|---|---|
| UC-06-01 | Watch a Lesson Video | Student | Primary Task |
| UC-06-02 | Mark a Lesson as Complete | Student | Primary Task |
| UC-06-03 | Resume Learning | Student | Primary Task |
| UC-06-04 | Navigate the Course Outline | Student | Subfunction |

## Use Case Template

Each use case follows this Cockburn template:

```
Use Case: UC-XX-XX — [Active-verb phrase]

Goal in Context:  [Why this matters to the actor]
Scope:            Learn Wren Platform
Level:            [Primary Task | Subfunction]
Primary Actor:    [Guest | Student | Instructor | Administrator | System]
Preconditions:    [What must be true before starting]
Success End:      [System state after success]
Failed End:       [System state after failure/abandonment]

Main Success Scenario:
  1. [Actor does X]
  2. [System responds with Y]
  3. ...

Extensions:
  2a. [Condition]:
      1. [Alternative step]
      2. ...
```

## Conventions

- **ID format:** `UC-XX-XX` matching epic and story numbers (UC-01-01 maps to US-01-01)
- **Scope:** Always "Learn Wren Platform"
- **Cross-references:** When one use case invokes another, reference by ID (e.g., "see UC-01-02")
- **Concrete values:** Use specific numbers from the specs (e.g., "12+ characters" for passwords, "max 10GB" for video uploads)
- **No implementation details:** Describe what happens, not how (e.g., "System authenticates the user" not "System validates JWT token")

## File Organization

One markdown file per epic in `docs/use-cases/`:

- `docs/use-cases/01-user-identity-and-access.md`
- `docs/use-cases/02-course-authoring.md`
- `docs/use-cases/03-video-management-and-drm.md`
- `docs/use-cases/04-lesson-materials.md`
- `docs/use-cases/05-course-discovery-and-enrollment.md`
- `docs/use-cases/06-learning-experience.md`

## Sample Use Case

```
Use Case: UC-05-04 — Enrol in a Course

Goal in Context:  A student gains access to a course's content by enrolling.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Student
Preconditions:    - The student is authenticated and has the Student role.
                  - The course is in Published status.
                  - The student is not already enrolled in the course.
Success End:      The student is enrolled. The course appears in the student's
                  enrolled courses list. The instructor's enrollment count is
                  incremented by one.
Failed End:       The student is not enrolled. No enrollment record is created.

Main Success Scenario:
  1. The student navigates to the course detail page (see UC-05-03).
  2. The system displays a prominent "Enrol" button.
  3. The student clicks "Enrol."
  4. The system creates an enrollment record linking the student to the course.
  5. The system increments the course's enrollment count.
  6. The system redirects the student to the first lesson of the course.

Extensions:
  1a. The student is a Guest (not authenticated):
      1. The system displays the "Enrol" button but redirects to the login
         page when clicked (see UC-01-02).
      2. After successful login, the system automatically completes enrollment
         and redirects to the first lesson.

  3a. The student is already enrolled:
      1. The system displays "Continue Learning" instead of "Enrol."
      2. Clicking it redirects to the student's last accessed lesson
         (see UC-06-03).

  4a. The course has been unpublished between page load and enrollment:
      1. The system displays an error: "This course is no longer available."
      2. The system redirects the student to the course catalogue.
```

## Extension Coverage Guidelines

Each use case should cover:

1. **Happy path** — the main success scenario
2. **Validation failures** — invalid input, missing fields, format errors
3. **Authorization failures** — wrong role, unauthenticated access
4. **Concurrency/state conflicts** — resource deleted or changed between load and action
5. **System failures** — relevant external service unavailable (e.g., transcoding service down, storage full)

Not every use case will have all 5 categories. Include only those that are meaningful for the specific interaction.
