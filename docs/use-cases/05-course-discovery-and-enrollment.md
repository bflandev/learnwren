# EP-05: Course Discovery and Enrollment — Use Cases

This document contains the fully-dressed Cockburn use cases for browsing, searching, viewing, enrolling, and unenrolling from courses.

> [!NOTE]
> **DRIFT — this spec is unimplemented.** Frozen 2026-03-27. EP-05 (course discovery, search, course-detail, enrolment) is entirely deferred — no catalogue, search, or enrolment surface exists. The `Enrollment` type in `shared-data-models` is a forward declaration with no behavior behind it. See the [Specification Drift Report](../quality/spec-drift-report.md#ep-05--course-discovery-and-enrollment).

---

## UC-05-01 — Browse the Course Catalogue

```
Use Case: UC-05-01 — Browse the Course Catalogue

Goal in Context:  A guest or student discovers courses by browsing the
                  catalogue of published courses.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Guest or Student
Preconditions:    - At least one course is in Published status.
Success End:      The user is viewing a filtered, sorted list of published
                  courses.
Failed End:       The catalogue fails to load or displays an error.

Main Success Scenario:
  1. The user navigates to the course catalogue page.
  2. The system displays all Published courses as cards showing: cover image,
     title, instructor name, and difficulty level.
  3. The system displays at least 20 courses per page with pagination or
     infinite scroll.
  4. The user browses the courses.

Extensions:
  2a. The user filters by category:
      1. The user selects a category from the filter dropdown.
      2. The system displays only courses matching the selected category.

  2b. The user filters by difficulty level:
      1. The user selects a difficulty level (Beginner, Intermediate, or
         Advanced).
      2. The system displays only courses matching the selected level.

  2c. The user changes the sort order:
      1. The user selects a sort option: Newest, Most Popular (by enrolment
         count), or Alphabetical.
      2. The system re-sorts the displayed courses.

  2d. No courses match the applied filters:
      1. The system displays: "No courses match your filters. Try adjusting
         your search criteria."
```

---

## UC-05-02 — Search for Courses

```
Use Case: UC-05-02 — Search for Courses

Goal in Context:  A guest or student finds courses on a specific topic by
                  searching with keywords.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Guest or Student
Preconditions:    - The search bar is accessible from any page on the platform.
Success End:      The user sees a relevance-ranked list of courses matching
                  their search query.
Failed End:       The search fails or returns an error.

Main Success Scenario:
  1. The user types a keyword into the search bar from any page.
  2. The user presses Enter or clicks the search icon.
  3. The system searches course titles and descriptions for the keyword
     (case-insensitive).
  4. The system displays a results page listing matching courses, ranked
     by relevance.

Extensions:
  4a. No courses match the search query:
      1. The system displays: "No courses found for your search. Try
         different keywords or browse the catalogue."
      2. The system provides a link to the course catalogue.

  1a. The user submits an empty search:
      1. The system redirects to the course catalogue (see UC-05-01).
```

---

## UC-05-03 — View a Course Detail Page

```
Use Case: UC-05-03 — View a Course Detail Page

Goal in Context:  A guest or student views detailed information about a course
                  to decide whether to enrol.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Guest or Student
Preconditions:    - The course is in Published status.
Success End:      The user is viewing the course detail page with full
                  course information and structure.
Failed End:       The page fails to load or the course is not found.

Main Success Scenario:
  1. The user clicks on a course card from the catalogue or search results.
  2. The system displays the course detail page with:
     - Title and cover image
     - Full description
     - Instructor name and biography
     - Difficulty level
     - Total number of lessons
     - Course structure (module and lesson titles, but not video content)
  3. The system displays a prominent "Enrol" button for unenrolled users.

Extensions:
  3a. The user is already enrolled in the course:
      1. The system displays "Continue Learning" instead of "Enrol,"
         linking to the last accessed lesson (see UC-06-03).

  3b. The user is a Guest (not authenticated):
      1. The system displays the "Enrol" button. Clicking it redirects
         to the login page (see UC-01-02), with automatic enrolment
         after login (see UC-05-04, extension 1a).

  1a. The course has been unpublished or does not exist:
      1. The system displays a 404 page: "Course not found."
      2. The system provides a link to the course catalogue.
```

---

## UC-05-04 — Enrol in a Course

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
                  enrolled courses list. The instructor's enrolment count is
                  incremented by one.
Failed End:       The student is not enrolled. No enrolment record is created.

Main Success Scenario:
  1. The student navigates to the course detail page (see UC-05-03).
  2. The system displays a prominent "Enrol" button.
  3. The student clicks "Enrol."
  4. The system creates an enrolment record linking the student to the course.
  5. The system increments the course's enrolment count.
  6. The system redirects the student to the first lesson of the course.

Extensions:
  1a. The student is a Guest (not authenticated):
      1. The system displays the "Enrol" button but redirects to the login
         page when clicked (see UC-01-02).
      2. After successful login, the system automatically completes enrolment
         and redirects to the first lesson.

  3a. The student is already enrolled:
      1. The system displays "Continue Learning" instead of "Enrol."
      2. Clicking it redirects to the student's last accessed lesson
         (see UC-06-03).

  4a. The course has been unpublished between page load and enrolment:
      1. The system displays an error: "This course is no longer available."
      2. The system redirects the student to the course catalogue.
```

---

## UC-05-05 — Unenrol from a Course

```
Use Case: UC-05-05 — Unenrol from a Course

Goal in Context:  A student removes a course they no longer wish to take from
                  their dashboard.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Student
Preconditions:    - The student is authenticated.
                  - The student is enrolled in the course.
Success End:      The student is unenrolled. Access to the course's videos and
                  materials is revoked immediately. Progress data is retained
                  for 90 days.
Failed End:       The student remains enrolled. No changes are made.

Main Success Scenario:
  1. The student navigates to the course detail page.
  2. The system displays a "Leave Course" option for enrolled students.
  3. The student clicks "Leave Course."
  4. The system displays a confirmation dialog: "Are you sure you want to
     leave this course? You will lose access to videos and materials
     immediately. Your progress will be saved for 90 days in case you
     re-enrol."
  5. The student confirms the action.
  6. The system removes the enrolment record (soft-delete with 90-day
     retention).
  7. The system revokes the student's access to the course videos and
     materials.
  8. The course is removed from the student's enrolled courses list.

Extensions:
  5a. The student cancels the confirmation:
      1. The system closes the dialog. The enrolment is unchanged.
      2. The use case ends.

  Note: If the student re-enrols within 90 days, their previous progress
  data is restored.
```
