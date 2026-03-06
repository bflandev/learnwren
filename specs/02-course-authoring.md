> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# EP-02: Course Authoring

This epic covers the full lifecycle of course creation, from initial setup through to publication. It implements the hierarchical content model: a **Course** is a container for one or more **Modules**, each of which contains an ordered sequence of **Lessons**.

---

## US-02-01: Create a New Course

> **As an** Instructor, **I want to** create a new course **so that** I can begin building a structured learning experience for students.

**Acceptance Criteria (Conditions of Satisfaction):**

- A "Create Course" button is prominently available on the Instructor's dashboard.
- The course creation form requires a title (max 100 characters) and a short description (max 500 characters).
- Optional fields include a long description, a category (selected from a predefined list), a cover image (JPEG or PNG, min 1280×720 pixels), and a difficulty level (Beginner, Intermediate, Advanced).
- A new course is created in **Draft** status and is not visible to students.
- The Instructor is automatically set as the course owner.

---

## US-02-02: Add and Manage Modules

> **As an** Instructor, **I want to** add modules to my course **so that** I can organise the content into logical sections or chapters.

**Acceptance Criteria (Given / When / Then):**

- **Given** I am in the course editor,
- **When** I click "Add Module",
- **Then** a new module is created with a default title (e.g., "Module 1") that I can immediately rename.
- **And** the module appears at the bottom of the course structure.

- **Given** I have multiple modules,
- **When** I drag a module to a new position,
- **Then** the module order is updated and saved.

- **Given** I want to remove a module,
- **When** I click "Delete Module" and confirm the action,
- **Then** the module and all its lessons are permanently removed.

---

## US-02-03: Add and Manage Lessons Within a Module

> **As an** Instructor, **I want to** add lessons to a module **so that** I can define the individual units of learning content within each section.

**Acceptance Criteria (Conditions of Satisfaction):**

- Each lesson has a title (max 100 characters) and an optional text description.
- Lessons within a module can be reordered by drag-and-drop.
- A lesson can contain exactly one video and any number of attached materials.
- Lessons can be deleted individually without affecting other lessons in the module.

---

## US-02-04: Publish and Unpublish a Course

> **As an** Instructor, **I want to** publish my course when it is ready **so that** students can discover and enrol in it.

**Acceptance Criteria (Conditions of Satisfaction):**

- A course can only be published if it has at least one module with at least one lesson, and every lesson has an associated video.
- Upon publication, the course status changes from **Draft** to **Published** and becomes visible in the course catalogue.
- An Instructor can revert a published course to **Draft** at any time, which hides it from the catalogue but does not unenrol existing students.
- An Instructor can archive a course, which hides it from the catalogue and prevents new enrolments but allows existing students to continue accessing it.
