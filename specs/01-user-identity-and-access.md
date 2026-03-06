> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# EP-01: User Identity and Access

This epic covers all aspects of user authentication, authorisation, and profile management. It is the foundational epic upon which all other epics depend, as every meaningful action on the platform requires a verified identity.

---

## US-01-01: Guest Registration

> **As a** Guest, **I want to** create an account on the platform **so that** I can enrol in courses and access learning content.

**Acceptance Criteria (Conditions of Satisfaction):**

- A registration form collects a display name, a unique email address, and a password.
- The password must be at least 12 characters and contain at least one uppercase letter, one lowercase letter, one digit, and one special character.
- Upon submission, the system sends a verification email to the provided address.
- The account is inactive until the email link is clicked.
- If the email address is already registered, the form displays a clear error message without revealing whether the account exists (to prevent enumeration attacks).
- The new account is assigned the **Student** role by default.

---

## US-01-02: Authenticated Login

> **As a** registered User, **I want to** log in to the platform with my email and password **so that** I can access my account and enrolled courses.

**Acceptance Criteria (Given / When / Then):**

- **Given** I am on the login page,
- **When** I enter a valid email and correct password and click "Sign In",
- **Then** I am redirected to my personal dashboard.
- **And** a secure, short-lived session token (JWT or equivalent) is issued and stored in an HttpOnly cookie.

- **Given** I enter an incorrect password three consecutive times,
- **When** I attempt a fourth login within 15 minutes,
- **Then** my account is temporarily locked and I receive an email with instructions to unlock it.

---

## US-01-03: User Profile Management

> **As a** Student or Instructor, **I want to** edit my profile information **so that** other users and instructors can learn about me.

**Acceptance Criteria (Conditions of Satisfaction):**

- A user can update their display name, profile picture (JPEG or PNG, max 2 MB), and a short biography.
- A user can change their email address, which triggers a re-verification flow.
- A user can change their password by providing their current password and a new one.
- Profile changes are saved immediately and reflected across the platform.

---

## US-01-04: Instructor Role Request

> **As a** Student, **I want to** apply to become an Instructor **so that** I can create and publish my own courses.

**Acceptance Criteria (Conditions of Satisfaction):**

- A "Become an Instructor" option is accessible from the user's profile settings.
- The application form collects a brief statement of intent and areas of expertise.
- The request is submitted to the Administrator queue for review.
- The user receives an email notification when their request is approved or declined.
- Upon approval, the user's role is updated to **Instructor** and they gain access to the course authoring tools.
