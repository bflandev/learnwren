# EP-02: Course Authoring — Use Cases

This document contains the fully-dressed Cockburn use cases for course creation, module and lesson management, and publication.

> [!NOTE]
> **DRIFT — this spec no longer matches the implementation.** Frozen 2026-03-27 and not reconciled since. The CRUD core is faithful, but cover image (UC-02-01) is unbuilt, module creation prompts for a title instead of generating a default (UC-02-02), lesson deletion cascades to the video and materials (UC-02-03), and the publish gate adds an eligibility-preview surface and a restore transition beyond UC-02-04. See the [Specification Drift Report](../quality/spec-drift-report.md#ep-02--course-authoring).

---

## UC-02-01 — Create a New Course

```
Use Case: UC-02-01 — Create a New Course

Goal in Context:  An instructor creates a new course shell to begin building a
                  structured learning experience.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Instructor
Preconditions:    - The user is authenticated with the Instructor role.
Success End:      A new course exists in Draft status. The instructor is set as
                  the course owner. The course is not visible to students.
Failed End:       No course is created.

Main Success Scenario:
  1. The instructor clicks "Create Course" from their dashboard.
  2. The system displays the course creation form with required and optional
     fields.
  3. The instructor enters:
     - Title (required, max 100 characters)
     - Short description (required, max 500 characters)
     - Optionally: long description, category (from predefined list), cover
       image (JPEG or PNG, min 1280x720 pixels), difficulty level (Beginner,
       Intermediate, or Advanced)
  4. The instructor clicks "Create."
  5. The system validates the input.
  6. The system creates the course in Draft status with the instructor as owner.
  7. The system redirects the instructor to the course editor.

Extensions:
  5a. The title exceeds 100 characters:
      1. The system displays: "Title must be 100 characters or fewer."
      2. The use case returns to step 3.

  5b. The short description exceeds 500 characters:
      1. The system displays: "Description must be 500 characters or fewer."
      2. The use case returns to step 3.

  5c. The cover image does not meet requirements:
      1. The system displays: "Cover image must be JPEG or PNG, at least
         1280x720 pixels."
      2. The use case returns to step 3.

  5d. Required fields (title or short description) are empty:
      1. The system highlights the missing fields with validation errors.
      2. The use case returns to step 3.
```

---

## UC-02-02 — Add and Manage Modules

```
Use Case: UC-02-02 — Add and Manage Modules

Goal in Context:  An instructor organises course content into logical sections
                  by creating, reordering, and deleting modules.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Instructor
Preconditions:    - The instructor is authenticated.
                  - The instructor owns the course.
                  - The instructor is in the course editor.
Success End:      The course structure reflects the instructor's changes
                  (modules added, renamed, reordered, or deleted).
Failed End:       No changes are saved. The course structure is unchanged.

Main Success Scenario:
  1. The instructor clicks "Add Module" in the course editor.
  2. The system creates a new module with a default title (e.g., "Module 1")
     and places it at the bottom of the course structure.
  3. The instructor renames the module by clicking the title and typing a
     new name.
  4. The system saves the new title.

Extensions:
  1a. The instructor reorders modules:
      1. The instructor drags a module to a new position.
      2. The system updates the module order and saves immediately.

  1b. The instructor deletes a module:
      1. The instructor clicks "Delete Module."
      2. The system displays a confirmation dialog: "This will permanently
         remove this module and all its lessons. This action cannot be undone."
      3. The instructor confirms the deletion.
      4. The system removes the module and all its lessons.

  1b-3a. The instructor cancels the deletion:
      1. The system closes the dialog.
      2. The module is unchanged. The use case ends.

  3a. The instructor leaves the title empty:
      1. The system reverts to the previous title.
```

---

## UC-02-03 — Add and Manage Lessons

```
Use Case: UC-02-03 — Add and Manage Lessons

Goal in Context:  An instructor adds and manages individual lessons within a
                  module, defining the units of learning content.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Instructor
Preconditions:    - The instructor is authenticated.
                  - The instructor owns the course.
                  - At least one module exists in the course.
Success End:      The module contains the instructor's desired lessons with
                  titles, descriptions, and correct ordering.
Failed End:       No changes are saved.

Main Success Scenario:
  1. The instructor clicks "Add Lesson" within a module.
  2. The system creates a new lesson and prompts for a title.
  3. The instructor enters a title (max 100 characters) and an optional
     description.
  4. The system saves the lesson and adds it to the bottom of the module.

Extensions:
  3a. The title exceeds 100 characters:
      1. The system displays: "Lesson title must be 100 characters or fewer."
      2. The use case returns to step 3.

  1a. The instructor reorders lessons within a module:
      1. The instructor drags a lesson to a new position.
      2. The system updates the lesson order and saves immediately.

  1b. The instructor deletes a lesson:
      1. The instructor clicks "Delete Lesson."
      2. The system displays a confirmation dialog.
      3. The instructor confirms.
      4. The system removes the lesson. Other lessons in the module are
         unaffected.

  1b-3a. The instructor cancels the deletion:
      1. The system closes the dialog. The lesson is unchanged.

  Note: A lesson can contain exactly one video (see UC-03-01) and any number
  of attached materials (see UC-04-01).
```

---

## UC-02-04 — Publish or Unpublish a Course

```
Use Case: UC-02-04 — Publish or Unpublish a Course

Goal in Context:  An instructor makes a course available to students by
                  publishing it, or withdraws it by reverting to draft or
                  archiving.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Instructor
Preconditions:    - The instructor is authenticated.
                  - The instructor owns the course.
Success End:      The course status has been updated (Published, Draft, or
                  Archived) and visibility reflects the new status.
Failed End:       The course status is unchanged.

Main Success Scenario:
  1. The instructor navigates to the course editor.
  2. The instructor clicks "Publish Course."
  3. The system validates the course meets publication requirements:
     - At least one module exists.
     - Each module has at least one lesson.
     - Every lesson has an associated video that has completed transcoding
       and DRM encryption.
  4. The system changes the course status from Draft to Published.
  5. The course becomes visible in the course catalogue.

Extensions:
  3a. The course does not meet publication requirements:
      1. The system displays specific errors indicating what is missing
         (e.g., "Module 2, Lesson 3 has no video").
      2. The use case returns to step 1.

  2a. The instructor unpublishes a published course (reverts to Draft):
      1. The instructor clicks "Unpublish Course."
      2. The system changes the status from Published to Draft.
      3. The course is hidden from the catalogue.
      4. Existing enrolled students retain access to the course content.

  2b. The instructor archives a course:
      1. The instructor clicks "Archive Course."
      2. The system changes the status to Archived.
      3. The course is hidden from the catalogue and no new enrollments
         are accepted.
      4. Existing enrolled students retain access to the course content.
```
