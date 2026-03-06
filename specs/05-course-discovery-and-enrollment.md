> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# EP-05: Course Discovery and Enrollment

This epic covers how students find courses and register their interest in them. It is the primary entry point for the learner journey.

---

## US-05-01: Browse the Course Catalogue

> **As a** Guest or Student, **I want to** browse all available courses **so that** I can discover topics that interest me.

**Acceptance Criteria (Conditions of Satisfaction):**

- The course catalogue displays all **Published** courses as cards, showing the cover image, title, instructor name, and difficulty level.
- The catalogue supports pagination or infinite scroll (at least 20 courses per page).
- Courses can be filtered by category and difficulty level.
- Courses can be sorted by newest, most popular (by enrolment count), and alphabetical order.

---

## US-05-02: Search for Courses

> **As a** Guest or Student, **I want to** search for courses by keyword **so that** I can quickly find content on a specific topic.

**Acceptance Criteria (Given / When / Then):**

- **Given** I am on any page of the platform,
- **When** I type a keyword into the search bar and press Enter,
- **Then** I am shown a results page listing all courses whose title or description contains the keyword.
- **And** the search is case-insensitive.
- **And** results are ranked by relevance.

- **Given** my search returns no results,
- **When** the results page loads,
- **Then** a helpful message is displayed suggesting I try different keywords or browse the catalogue.

---

## US-05-03: View a Course Detail Page

> **As a** Guest or Student, **I want to** view a detailed page for a course **so that** I can decide whether to enrol.

**Acceptance Criteria (Conditions of Satisfaction):**

- The course detail page displays the title, cover image, full description, instructor name and bio, difficulty level, total number of lessons, and the course structure (module and lesson titles, but not the video content).
- A prominent "Enrol" button is displayed for users who are not yet enrolled.
- For enrolled students, the button changes to "Continue Learning" and links to the last accessed lesson.

---

## US-05-04: Enrol in a Course

> **As a** Student, **I want to** enrol in a course **so that** I can access its video content and materials.

**Acceptance Criteria (Given / When / Then):**

- **Given** I am a logged-in Student viewing a course detail page,
- **When** I click the "Enrol" button,
- **Then** I am enrolled in the course immediately.
- **And** I am redirected to the first lesson of the course.
- **And** the Instructor's enrolment count for the course is incremented by one.

- **Given** I am a Guest (not logged in) and click "Enrol",
- **When** the action is triggered,
- **Then** I am redirected to the login page with a message indicating that I need to sign in to enrol.
- **And** after logging in, I am redirected back to the course and the enrolment is completed automatically.

---

## US-05-05: Unenrol from a Course

> **As a** Student, **I want to** unenrol from a course I no longer wish to take **so that** it is removed from my dashboard.

**Acceptance Criteria (Conditions of Satisfaction):**

- A "Leave Course" option is available from the course detail page for enrolled students.
- The student must confirm the action before it is processed.
- Upon unenrolment, the student's progress data is retained for 90 days in case they re-enrol.
- The student loses access to the course videos and materials immediately upon unenrolment.
