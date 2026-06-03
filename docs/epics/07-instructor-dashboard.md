> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# EP-07: Instructor Dashboard

This epic provides Instructors with the tools they need to manage their courses and understand their student base.

**Implementation status:** ✅ All three user stories are shipped — **EP-07 (Instructor Dashboard) is complete**. `README.md` (the authoritative feature record) and `docs/USER_GUIDE.md` §§2.20–2.22 document the delivered behavior. (The DRAFT banner above reflects the spec's review status, not its build status.)

---

## US-07-01: View Enrolled Students

> **As an** Instructor, **I want to** see a list of all students enrolled in my course **so that** I can understand who is taking my course.

**Status:** ✅ Shipped — EP-07 Slice A, merged 2026-06-01 (`5123955`).

**Acceptance Criteria (Conditions of Satisfaction):**

- The course management page displays a table of enrolled students, showing their display name, email address, enrollment date, and overall course progress percentage.
- The list can be sorted by enrollment date (newest/oldest) and progress.
- The list can be exported as a CSV file.
- The Instructor cannot see any payment or personal information beyond what is listed above.

---

## US-07-02: View Course Analytics

> **As an** Instructor, **I want to** see basic analytics for my course **so that** I can understand how students are engaging with the content.

**Status:** ✅ Shipped — EP-07 Slice B, merged 2026-06-01 (`10e6d87`).

**Acceptance Criteria (Conditions of Satisfaction):**

- The analytics dashboard displays the total number of enrolled students, the average course completion rate, and the number of new enrollments in the last 7, 30, and 90 days.
- A per-lesson breakdown shows the average watch time and completion rate for each lesson.
- The analytics are updated at least once every 24 hours.

---

## US-07-03: Manage Course Content After Publication

> **As an** Instructor, **I want to** edit my course content after it has been published **so that** I can correct mistakes and add new material.

**Status:** ✅ Shipped — post-publication editing is served by existing course CRUD (EP-02/03/04); the "notify enrolled students when a new module is added" criterion was delivered in EP-07 Slice C, merged 2026-06-02 (`8567e52`).

**Acceptance Criteria (Conditions of Satisfaction):**

- An Instructor can edit the course title, description, and cover image at any time.
- An Instructor can add new modules and lessons to a published course.
- An Instructor can replace the video for an existing lesson. The new video goes through the transcoding and DRM pipeline before it becomes available to students.
- An Instructor can update or remove lesson materials at any time.
- Enrolled students are not notified of minor edits, but are notified when a new module is added.
