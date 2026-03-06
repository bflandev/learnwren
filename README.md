> [!NOTE]
> **PROJECT STATUS: SPECIFICATION PHASE**
> This repository contains the product and technical specifications for **Teachify**, an open-source, self-hosted educational video platform. The project is currently in the planning and specification phase. No code has been written yet.

# Teachify: Open-Source Educational Video Platform

Teachify is a self-hosted, open-source educational platform inspired by Skillshare. It enables any registered user to create and publish video-based courses organised into modules and lessons. Courses are consumed by enrolled students who can stream protected video content and download supplementary lesson materials. The platform is designed for small communities — such as a group of friends, a company, or a non-profit — and can be deployed on commodity hardware or a cloud server. All video content is protected by industry-standard Digital Rights Management (DRM) to prevent unauthorised redistribution.

---

## Product Specifications

The product requirements are defined using the original Agile methodology, broken down into Epics and User Stories with detailed Acceptance Criteria. The full set of specifications can be found in the `/epics` directory.

| Spec ID | Title | Description |
| :--- | :--- | :--- |
| `00` | [Product Vision](./epics/00-vision-and-epics.md) | High-level vision, actors, and epic overview. |
| `01` | [User Identity and Access](./epics/01-user-identity-and-access.md) | Registration, login, profiles, and role-based access control. |
| `02` | [Course Authoring](./epics/02-course-authoring.md) | Creating, structuring, and publishing courses with modules and lessons. |
| `03` | [Video Management and DRM](./epics/03-video-management-and-drm.md) | Uploading, transcoding, storing, and securely delivering video content. |
| `04` | [Lesson Materials](./epics/04-lesson-materials.md) | Attaching, managing, and downloading supplementary course materials. |
| `05` | [Course Discovery and Enrollment](./epics/05-course-discovery-and-enrollment.md) | Browsing, searching, and enrolling in courses. |
| `06` | [Learning Experience](./epics/06-learning-experience.md) | Consuming course content, tracking progress, and resuming sessions. |
| `07` | [Instructor Dashboard](./epics/07-instructor-dashboard.md) | Managing courses, viewing enrolled students, and monitoring engagement. |
| `08` | [Platform Administration](./epics/08-platform-administration.md) | User management, content moderation, and system configuration. |
| `09` | [Non-Functional Requirements](./epics/09-non-functional-requirements.md) | Performance, security, accessibility, and open-source compliance. |

---

## Technical Architecture

A detailed breakdown of the recommended technical architecture, including the technology stack, data models, and system diagrams, can be found in the [**Technical Architecture**](./epics/TECHNICAL_ARCHITECTURE.md) document.

---

## Contributing

This project is in its early stages. Contributions are welcome. Please start by reviewing the product specifications and technical architecture. If you have suggestions or would like to contribute to the development, please open an issue to start a discussion.

