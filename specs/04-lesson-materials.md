> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# EP-04: Lesson Materials

This epic covers the management of non-video supplementary content attached to lessons, such as PDFs, slide decks, worksheets, and reference documents.

---

## US-04-01: Attach Materials to a Lesson

> **As an** Instructor, **I want to** attach supplementary files to a lesson **so that** students have reference materials to support the video content.

**Acceptance Criteria (Conditions of Satisfaction):**

- An Instructor can attach multiple files to a single lesson.
- Supported file types include PDF, DOCX, PPTX, XLSX, TXT, and ZIP (max 50 MB per file).
- Each attachment has a display name that the Instructor can customise.
- Attachments are listed below the video player on the lesson page.
- An Instructor can remove an attachment at any time.

---

## US-04-02: Download Lesson Materials

> **As a** Student, **I want to** download the lesson materials **so that** I can study them offline or refer to them later.

**Acceptance Criteria (Conditions of Satisfaction):**

- A "Download" button is displayed next to each attachment on the lesson page.
- Downloads are only available to enrolled students.
- The download link is a signed, time-limited URL that expires after 15 minutes to prevent sharing.
- The file is served with the correct MIME type and the original filename.
