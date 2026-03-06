> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# Product Vision: OpenLearn

OpenLearn is a self-hosted, open-source educational platform inspired by Skillshare. It enables any registered user to create and publish video-based courses organised into modules and lessons. Courses are consumed by enrolled students who can stream protected video content and download supplementary lesson materials. The platform is designed for small communities — such as a group of friends, a company, or a non-profit — and can be deployed on commodity hardware or a cloud server. All video content is protected by industry-standard Digital Rights Management (DRM) to prevent unauthorised redistribution.

---

## Actors and Roles

The following table defines the primary actors referenced throughout the user stories.

| Role | Description |
| :--- | :--- |
| **Guest** | An unauthenticated visitor browsing the public-facing pages of the platform. |
| **Student** | An authenticated user who has enrolled in one or more courses. |
| **Instructor** | An authenticated user who has been granted permission to create and publish courses. Any registered user may apply to become an Instructor. |
| **Administrator** | A privileged user responsible for platform configuration, user management, and content moderation. |

---

## Epic Overview

The following table provides a summary of all epics in this document.

| Epic ID | Epic Name | Description |
| :--- | :--- | :--- |
| EP-01 | User Identity and Access | Registration, login, profiles, and role-based access control. |
| EP-02 | Course Authoring | Creating, structuring, and publishing courses with modules and lessons. |
| EP-03 | Video Management and DRM | Uploading, transcoding, storing, and securely delivering video content. |
| EP-04 | Lesson Materials | Attaching, managing, and downloading supplementary course materials. |
| EP-05 | Course Discovery and Enrollment | Browsing, searching, and enrolling in courses. |
| EP-06 | Learning Experience | Consuming course content, tracking progress, and resuming sessions. |
| EP-07 | Instructor Dashboard | Managing courses, viewing enrolled students, and monitoring engagement. |
| EP-08 | Platform Administration | User management, content moderation, and system configuration. |
| EP-09 | Non-Functional Requirements | Performance, security, accessibility, and open-source compliance. |
