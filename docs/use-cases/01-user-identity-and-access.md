# EP-01: User Identity and Access — Use Cases

This document contains the fully-dressed Cockburn use cases for user registration, authentication, profile management, and role requests.

> [!NOTE]
> **STATUS: PARTIALLY IMPLEMENTED (updated 2026-05-29).** UC-01-01 (Register) and UC-01-02 (Log In) are wired up end to end — see `docs/superpowers/specs/2026-05-04-auth-registration-and-login-design.md` and `2026-05-06-auth-hardening-design.md` for the implemented design (strict email-verification gate, brute-force lockout, logged-out password reset, API-mediated login). UC-01-03 (Manage Profile) is **partially implemented**: **Slices A + B (text profile + picture) shipped 2026-05-27 and 2026-05-28** (see `docs/superpowers/specs/2026-05-27-uc-01-03-slice-a-text-profile-design.md` and `2026-05-28-uc-01-03-slice-b-profile-picture-design.md`). The main success scenario (steps 1–6, text fields) is live at `/settings/profile`, and Extension 3a (profile picture upload/replace/remove, JPEG/PNG ≤ 2 MB, auto-cropped to 512×512) is wired through to the header avatar chip, instructor avatars on course cards, and an instructor card with biography on the course detail page. **Slice C (ext 3b — email address change) shipped 2026-05-28** (see `docs/superpowers/specs/2026-05-28-uc-01-03-slice-c-email-change-design.md`): `POST /api/profile/email` re-authenticates with the current password and sends a verification link to the new address; `POST /api/profile/email/confirm` (invoked from the unguarded `/settings/profile/email-changed` landing page) syncs the Firestore mirror, revokes refresh tokens, and clears the session. **Slice D (ext 3c — password change) shipped 2026-05-29** (see `docs/superpowers/specs/2026-05-29-uc-01-03-slice-d-password-change-design.md`): extensions 3c / 3c-3a / 3c-4a are now wired — `POST /api/profile/password` re-authenticates with the current password, validates the new password against the same complexity policy as registration (12+ chars, upper, lower, digit, special), updates the credential, sends a password-changed notification email, and revokes refresh tokens (force re-login on all devices). **UC-01-03 is now fully implemented.** **UC-01-04 (Request Instructor Role) submission flow is now implemented (2026-05-29)**: the Student-only "Become an Instructor" section on `/settings/profile` (steps 1–8 of the main success scenario, plus extensions 2a / 2b / 6a) is wired end to end. Submitting a statement of intent and areas of expertise (free-text, server-validated non-empty + ≤ 2000 chars) persists a `PENDING` document in the new `instructorApplications` Firestore collection (doc id = uid) and swaps the form for an "under review" card that persists across reload. API: `GET /api/profile/instructor-application` (returns `{ status, statement?, expertise?, createdAt? }`) and `POST /api/profile/instructor-application`. The `pnpm tools:promote-to-instructor <email>` CLI now resolves a pending application to `APPROVED` (with `resolvedAt`) after flipping the role. See `docs/superpowers/specs/2026-05-29-uc-01-04-instructor-role-request-design.md`. **The asynchronous approve/decline post-condition of UC-01-04 remains deferred to EP-08**: the admin review queue UI, approve/decline actions, decision emails, and the user-facing DECLINED flow are not yet built; promotion remains CLI-mediated. Two minor behavioral divergences on the earlier shipped UCs are deliberate scope cuts: registration auto-mints a session cookie before email verification (subsequent logins still gate on `EMAIL_NOT_VERIFIED`), and a suspended account currently reports as invalid credentials rather than a distinct "account suspended" code. See the [Specification Drift Report](../quality/spec-drift-report.md#ep-01--user-identity-and-access) for the per-UC detail.

---

## UC-01-01 — Register a New Account

```
Use Case: UC-01-01 — Register a New Account

Goal in Context:  A guest creates a platform account to access learning content.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Guest
Preconditions:    - The guest has navigated to the registration page.
                  - The guest does not already have an account.
Success End:      A new inactive account exists with the Student role.
                  A verification email has been sent to the provided address.
Failed End:       No account is created. The guest remains unauthenticated.

Main Success Scenario:
  1. The guest navigates to the registration page.
  2. The system displays a registration form requesting a display name, email
     address, and password.
  3. The guest enters a display name, a unique email address, and a password
     that meets the complexity requirements.
  4. The system validates the input:
     - Email is a valid format and not already registered.
     - Password is at least 12 characters and contains at least one uppercase
       letter, one lowercase letter, one digit, and one special character.
  5. The system creates an inactive account with the Student role.
  6. The system sends a verification email containing a unique activation link.
  7. The system displays a confirmation message instructing the guest to check
     their email.
  8. The guest clicks the activation link in the email.
  9. The system activates the account and redirects to the login page.

Extensions:
  3a. The email address is already registered:
      1. The system displays a generic error message (e.g., "Unable to complete
         registration. Please check your details.") without revealing whether
         the email is in use (to prevent enumeration attacks).
      2. The use case ends.

  3b. The password does not meet complexity requirements:
      1. The system displays a specific error indicating which requirements
         are not met (e.g., "Password must contain at least one digit").
      2. The guest corrects the password and resubmits.
      3. The use case continues from step 4.

  8a. The activation link has expired:
      1. The system displays an error indicating the link has expired.
      2. The system offers a "Resend Verification Email" option.
      3. The guest requests a new email and the use case continues from step 6.

  8b. The activation link is invalid or has already been used:
      1. The system displays an error: "This link is invalid or has already
         been used."
      2. The use case ends.
```

---

## UC-01-02 — Log In to the Platform

```
Use Case: UC-01-02 — Log In to the Platform

Goal in Context:  A registered user authenticates to access their account and
                  enrolled courses.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Guest (registered but not yet authenticated)
Preconditions:    - The user has an active, verified account.
                  - The user is not currently logged in.
Success End:      The user is authenticated. A secure session token is issued
                  and stored in an HttpOnly cookie. The user is on their
                  personal dashboard.
Failed End:       The user is not authenticated. No session token is issued.

Main Success Scenario:
  1. The user navigates to the login page.
  2. The system displays a login form requesting email and password.
  3. The user enters their email and password and clicks "Sign In."
  4. The system verifies the credentials are correct.
  5. The system issues a secure, short-lived session token and stores it
     in an HttpOnly cookie.
  6. The system redirects the user to their personal dashboard.

Extensions:
  4a. The credentials are incorrect:
      1. The system displays a generic error: "Invalid email or password."
      2. The system increments the failed login counter for this account.
      3. The use case returns to step 2.

  4b. The account has been locked due to 3 consecutive failed login attempts:
      1. The system displays: "Your account has been temporarily locked.
         Please check your email for instructions to unlock it."
      2. The system sends an unlock email to the registered address.
      3. The lockout expires after 15 minutes.
      4. The use case ends.

  4c. The account has not been verified (email not confirmed):
      1. The system displays: "Please verify your email address before
         logging in."
      2. The system offers a "Resend Verification Email" option.
      3. The use case ends.

  4d. The account has been suspended by an administrator:
      1. The system displays: "Your account has been suspended. Please
         contact support."
      2. The use case ends.
```

---

## UC-01-03 — Manage User Profile

```
Use Case: UC-01-03 — Manage User Profile

Goal in Context:  An authenticated user updates their profile information so
                  that other users can learn about them.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Student or Instructor
Preconditions:    - The user is authenticated.
Success End:      The profile changes are saved and reflected across the
                  platform.
Failed End:       No profile changes are saved. The profile remains unchanged.

Main Success Scenario:
  1. The user navigates to their profile settings page.
  2. The system displays the current profile: display name, profile picture,
     biography, email address, and a password change option.
  3. The user updates one or more fields:
     - Display name
     - Profile picture (JPEG or PNG, max 2 MB)
     - Biography
  4. The user clicks "Save."
  5. The system validates the input and saves the changes.
  6. The system displays a success confirmation.

Extensions:
  3a. The user uploads a profile picture that exceeds 2 MB or is not
      JPEG/PNG:
      1. The system displays an error: "Profile picture must be JPEG or PNG
         and no larger than 2 MB."
      2. The use case returns to step 3.

  3b. The user changes their email address:
      1. The system sends a verification email to the new address.
      2. The current email remains active until the new address is verified.
      3. The user clicks the verification link in the email sent to the
         new address.
      4. The system updates the email and displays a confirmation.

  3c. The user changes their password:
      1. The system prompts for the current password and a new password.
      2. The user enters both.
      3. The system verifies the current password is correct.
      4. The system validates the new password meets complexity requirements
         (see UC-01-01 step 4).
      5. The system updates the password and displays a confirmation.

  3c-3a. The current password is incorrect:
      1. The system displays: "Current password is incorrect."
      2. The use case returns to step 3c-1.

  3c-4a. The new password does not meet complexity requirements:
      1. The system displays specific validation errors.
      2. The use case returns to step 3c-1.
```

---

## UC-01-04 — Request Instructor Role

```
Use Case: UC-01-04 — Request Instructor Role

Goal in Context:  A student applies to become an instructor so they can create
                  and publish courses.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Student
Preconditions:    - The user is authenticated with the Student role.
                  - The user does not already have a pending instructor
                    application.
Success End:      An instructor role request has been submitted and is queued
                  for administrator review. The student receives
                  acknowledgement of their submission.
Failed End:       No request is submitted. The student's role remains unchanged.

Main Success Scenario:
  1. The student navigates to their profile settings.
  2. The system displays a "Become an Instructor" option.
  3. The student clicks "Become an Instructor."
  4. The system displays an application form requesting a brief statement of
     intent and areas of expertise.
  5. The student fills in the form and clicks "Submit."
  6. The system validates the form (both fields are required and non-empty).
  7. The system creates a pending instructor application and adds it to the
     administrator review queue.
  8. The system displays a confirmation: "Your application has been submitted
     and is under review."

Extensions:
  2a. The user already has the Instructor role:
      1. The system does not display the "Become an Instructor" option.
      2. The use case does not apply.

  2b. The user already has a pending application:
      1. The system displays the status of the pending application instead
         of the application form.
      2. The use case ends.

  6a. Required fields are empty:
      1. The system highlights the empty fields with validation errors.
      2. The use case returns to step 5.

  Post-condition (asynchronous):
      - When the administrator approves the application, the system updates
        the user's role to Instructor and sends an approval email. The user
        gains access to course authoring tools.
      - When the administrator declines the application, the system sends a
        decline email. The user's role remains Student.
```
