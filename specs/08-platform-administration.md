> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# EP-08: Platform Administration

This epic covers the tools available to Administrators for managing the platform's users, content, and configuration.

---

## US-08-01: Manage User Accounts

> **As an** Administrator, **I want to** manage all user accounts on the platform **so that** I can maintain a safe and functional community.

**Acceptance Criteria (Conditions of Satisfaction):**

- The admin panel displays a searchable, paginated list of all registered users.
- An Administrator can view a user's profile, role, registration date, and enrolment history.
- An Administrator can promote a Student to Instructor, or demote an Instructor to Student.
- An Administrator can suspend a user account, preventing login without deleting the account.
- An Administrator can permanently delete a user account, which anonymises their data in accordance with data protection best practices.

---

## US-08-02: Manage Course Categories

> **As an** Administrator, **I want to** create and manage course categories **so that** the course catalogue is well-organised and easy to navigate.

**Acceptance Criteria (Conditions of Satisfaction):**

- An Administrator can create, rename, and delete course categories.
- Deleting a category prompts the Administrator to reassign affected courses to another category.
- Categories are displayed in alphabetical order in the course creation form and the catalogue filter.

---

## US-08-03: Review Instructor Applications

> **As an** Administrator, **I want to** review and approve or decline Instructor applications **so that** I can control who is permitted to create courses.

**Acceptance Criteria (Conditions of Satisfaction):**

- A dedicated queue in the admin panel lists all pending Instructor applications.
- Each application displays the applicant's name, email, and their statement of intent.
- An Administrator can approve or decline the application with a single click.
- The applicant receives an email notification of the decision.

---

## US-08-04: Monitor Platform Health

> **As an** Administrator, **I want to** view a system health dashboard **so that** I can proactively identify and resolve technical issues.

**Acceptance Criteria (Conditions of Satisfaction):**

- The dashboard displays the current status of key services: web server, database, video transcoding queue, and object storage.
- The dashboard shows total storage used, number of registered users, and number of published courses.
- Alerts are displayed when the transcoding queue exceeds 10 pending jobs or when disk usage exceeds 80%.
