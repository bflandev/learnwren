> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# EP-06: Learning Experience

This epic defines the experience of consuming course content. It focuses on the lesson player, progress tracking, and the ability to resume learning across sessions.

---

## US-06-01: Watch a Lesson Video

> **As a** Student, **I want to** watch the video for a lesson **so that** I can learn the instructional content.

**Acceptance Criteria (Conditions of Satisfaction):**

- The lesson page displays the video player, the lesson title, the lesson description, and any attached materials.
- The video player supports play, pause, seek, volume control, fullscreen, and playback speed adjustment (0.5×, 0.75×, 1×, 1.25×, 1.5×, 2×).
- The player displays subtitles/captions if they have been provided by the Instructor.
- The player is responsive and works correctly on desktop, tablet, and mobile browsers.
- The player is DRM-enabled and requests a license before playback begins (see US-03-04).

---

## US-06-02: Track Lesson Completion

> **As a** Student, **I want to** mark a lesson as complete **so that** I can track my progress through the course.

**Acceptance Criteria (Given / When / Then):**

- **Given** I am watching a lesson,
- **When** I click the "Mark as Complete" button,
- **Then** the lesson is marked as complete in my progress record.
- **And** the course outline visually indicates the lesson is complete (e.g., a checkmark icon).

- **Given** I have completed all lessons in a module,
- **When** I view the course outline,
- **Then** the module is also shown as complete.

- **Given** I have completed all lessons in the course,
- **When** I view the course detail page,
- **Then** a "Course Completed" badge is displayed on my profile and the course card.

---

## US-06-03: Resume Learning

> **As a** Student, **I want** the platform to remember where I left off **so that** I can continue learning without having to find my place manually.

**Acceptance Criteria (Conditions of Satisfaction):**

- The platform records the last lesson accessed by each student for each enrolled course.
- On the course detail page, a "Continue Learning" button links directly to the last accessed lesson.
- Within a lesson, the video player resumes playback from the last watched timestamp (within a 5-second tolerance).
- Progress is saved automatically as the student watches, not only when they close the page.

---

## US-06-04: Navigate the Course Outline

> **As a** Student, **I want to** see the full course outline while watching a lesson **so that** I can navigate to any lesson directly.

**Acceptance Criteria (Conditions of Satisfaction):**

- A collapsible course outline panel is displayed alongside the video player.
- The outline lists all modules and their lessons, with completion status indicators.
- Clicking a lesson title in the outline navigates to that lesson.
- The currently active lesson is visually highlighted in the outline.
