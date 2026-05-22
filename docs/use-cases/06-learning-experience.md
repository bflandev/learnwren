# EP-06: Learning Experience — Use Cases

This document contains the fully-dressed Cockburn use cases for the learning experience: watching videos, tracking progress, resuming sessions, and navigating course content.

> [!NOTE]
> **DRIFT — this spec is unimplemented.** Frozen 2026-03-27. EP-06 (lesson playback for students, progress tracking, resume, course-outline navigation) is entirely deferred. The only footprint in shipped code is two `TODO(EP-06)` owner-only access guards. See the [Specification Drift Report](../quality/spec-drift-report.md#ep-06--learning-experience).

---

## UC-06-01 — Watch a Lesson Video

```
Use Case: UC-06-01 — Watch a Lesson Video

Goal in Context:  An enrolled student watches a lesson's video to learn the
                  instructional content.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Student
Preconditions:    - The student is authenticated and enrolled in the course.
                  - The lesson video has completed transcoding and DRM
                    encryption.
Success End:      The student is watching the video in a responsive,
                  DRM-enabled player with full playback controls. Progress
                  is being auto-saved.
Failed End:       The video does not play. The student sees an error message.

Main Success Scenario:
  1. The student navigates to a lesson (via the course outline, "Continue
     Learning" button, or direct link).
  2. The system displays the lesson page with:
     - Video player
     - Lesson title and description
     - Attached materials list (see UC-04-02)
     - Course outline panel (see UC-06-04)
  3. The student clicks the play button.
  4. The player initiates DRM-protected playback (see UC-03-04).
  5. The video plays with controls: play, pause, seek, volume, fullscreen,
     and playback speed (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x).
  6. The system auto-saves the student's playback position as they watch.

Extensions:
  4a. DRM playback fails (license server unavailable or token expired):
      1. The player displays: "Unable to play video. Please try again later."
      2. The use case ends.

  5a. The video has subtitles/captions provided by the instructor:
      1. The player displays a captions toggle button.
      2. The student enables captions.
      3. The player renders subtitles over the video.

  1a. The student is not enrolled in the course:
      1. The system redirects to the course detail page (see UC-05-03)
         with the "Enrol" button displayed.
      2. The use case ends.

  1b. The lesson video is still being processed (transcoding or encryption):
      1. The system displays: "This lesson's video is still being processed.
         Please check back later."
      2. The use case ends.

  Note: The player is responsive and works on desktop, tablet, and mobile
  browsers.
```

---

## UC-06-02 — Mark a Lesson as Complete

```
Use Case: UC-06-02 — Mark a Lesson as Complete

Goal in Context:  A student marks a lesson as complete to track their progress
                  through the course.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Student
Preconditions:    - The student is authenticated and enrolled in the course.
                  - The student is on a lesson page.
Success End:      The lesson is marked as complete in the student's progress
                  record. Visual indicators reflect the completion.
Failed End:       The lesson is not marked as complete. Progress is unchanged.

Main Success Scenario:
  1. The student clicks the "Mark as Complete" button on the lesson page.
  2. The system updates the student's progress record to mark the lesson
     as complete.
  3. The course outline updates to show a checkmark next to the completed
     lesson (see UC-06-04).

Extensions:
  3a. All lessons in the module are now complete:
      1. The course outline shows the module as complete.

  3b. All lessons in the entire course are now complete:
      1. The system displays a "Course Completed" badge on the course
         detail page and the student's profile.
      2. The course card in the student's enrolled courses shows a
         completion indicator.

  1a. The lesson is already marked as complete:
      1. The button displays "Completed" in a disabled state.
      2. The use case does not apply.
```

---

## UC-06-03 — Resume Learning

```
Use Case: UC-06-03 — Resume Learning

Goal in Context:  A student returns to a course and picks up where they left
                  off without having to find their place manually.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Student
Preconditions:    - The student is authenticated and enrolled in the course.
                  - The student has previously accessed at least one lesson
                    in the course.
Success End:      The student is on their last accessed lesson, with the video
                  resumed from the last watched timestamp (within 5-second
                  tolerance).
Failed End:       The student cannot resume and must navigate manually.

Main Success Scenario:
  1. The student navigates to the course detail page.
  2. The system displays a "Continue Learning" button linking to the
     student's last accessed lesson.
  3. The student clicks "Continue Learning."
  4. The system navigates to the last accessed lesson.
  5. The video player resumes playback from the last watched timestamp
     (within a 5-second tolerance).

Extensions:
  2a. The student has not accessed any lesson yet:
      1. The system displays "Start Learning" instead of "Continue Learning,"
         linking to the first lesson of the course.

  5a. The last accessed lesson has been deleted by the instructor:
      1. The system navigates to the next available lesson in the course.
      2. If no lessons remain, the system displays: "This course currently
         has no available lessons."

  5b. The saved timestamp exceeds the video duration (video was replaced
      with a shorter one):
      1. The player starts from the beginning of the video.

  Note: Progress is saved automatically as the student watches, not only
  when they close the page.
```

---

## UC-06-04 — Navigate the Course Outline

```
Use Case: UC-06-04 — Navigate the Course Outline

Goal in Context:  A student navigates between lessons using a structured
                  outline displayed alongside the video player.
Scope:            Learn Wren Platform
Level:            Subfunction
Primary Actor:    Student
Preconditions:    - The student is authenticated and enrolled in the course.
                  - The student is on a lesson page.
Success End:      The student has navigated to a different lesson using the
                  outline.
Failed End:       Navigation fails. The student remains on the current lesson.

Main Success Scenario:
  1. The system displays a collapsible course outline panel alongside the
     video player.
  2. The outline lists all modules and their lessons, with:
     - Completion status indicators (checkmarks for completed lessons)
     - The currently active lesson visually highlighted
  3. The student clicks a lesson title in the outline.
  4. The system navigates to the selected lesson.
  5. The system saves the student's progress on the current lesson before
     navigating (see UC-06-03 auto-save).

Extensions:
  1a. The student collapses the outline panel:
      1. The outline panel hides, giving more space to the video player.
      2. The student can expand it again at any time.

  3a. The selected lesson's video is still being processed:
      1. The system displays: "This lesson's video is still being processed."
      2. The student remains on the current lesson.
```
