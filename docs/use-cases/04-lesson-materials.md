# EP-04: Lesson Materials — Use Cases

This document contains the fully-dressed Cockburn use cases for attaching and downloading supplementary lesson materials.

> [!NOTE]
> **STATUS: IMPLEMENTED (2026-05-26).** UC-04-01 (Attach Materials) and UC-04-02 (Download Materials) are both wired up. UC-04-02 ext 4a (auto-retry on expired URL) and ext 4b auto-removal of stale rows are deliberate scope cuts — see [the design spec](../superpowers/specs/2026-05-26-lesson-materials-student-download-design.md) §8. Per-row error copy + Retry handle these cases manually.

---

## UC-04-01 — Attach Materials to a Lesson

```
Use Case: UC-04-01 — Attach Materials to a Lesson

Goal in Context:  An instructor attaches supplementary files to a lesson so
                  that students have reference materials to support the video.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Instructor
Preconditions:    - The instructor is authenticated and owns the course.
                  - The lesson exists.
Success End:      One or more materials are attached to the lesson. Each
                  attachment has a display name and is listed below the video
                  player on the lesson page.
Failed End:       No materials are attached. The lesson is unchanged.

Main Success Scenario:
  1. The instructor navigates to the lesson in the course editor.
  2. The instructor clicks "Add Material."
  3. The system displays a file picker.
  4. The instructor selects one or more files (PDF, DOCX, PPTX, XLSX, TXT,
     or ZIP; max 50 MB per file).
  5. The system uploads and validates each file.
  6. The system assigns a default display name (the filename) to each
     attachment.
  7. The instructor optionally customises the display name for each
     attachment.
  8. The system saves the attachments. They appear in the materials list
     below the video player on the lesson page.

Extensions:
  4a. The file type is not supported:
      1. The system displays: "Unsupported file type. Supported formats:
         PDF, DOCX, PPTX, XLSX, TXT, ZIP."
      2. The unsupported file is skipped. Other valid files continue
         uploading.

  4b. A file exceeds 50 MB:
      1. The system displays: "File exceeds the 50 MB limit."
      2. The oversized file is skipped. Other valid files continue
         uploading.

  1a. The instructor removes an existing attachment:
      1. The instructor clicks "Remove" next to an attachment.
      2. The system displays a confirmation dialog.
      3. The instructor confirms.
      4. The system removes the attachment from the lesson.

  1a-3a. The instructor cancels the removal:
      1. The system closes the dialog. The attachment is unchanged.
```

---

## UC-04-02 — Download Lesson Materials

```
Use Case: UC-04-02 — Download Lesson Materials

Goal in Context:  An enrolled student downloads supplementary materials to
                  study offline or refer to later.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Student
Preconditions:    - The student is authenticated.
                  - The student is enrolled in the course.
                  - The lesson has one or more attached materials.
Success End:      The student has downloaded the requested material with the
                  correct MIME type and original filename.
Failed End:       The download does not start. The student sees an
                  appropriate error.

Main Success Scenario:
  1. The student navigates to a lesson page.
  2. The system displays the materials list below the video player, with a
     "Download" button next to each attachment.
  3. The student clicks "Download" on an attachment.
  4. The system generates a signed, time-limited download URL (expires after
     15 minutes).
  5. The browser downloads the file with the correct MIME type and original
     filename.

Extensions:
  3a. The student is not enrolled in the course:
      1. The system does not display the "Download" button.
      2. If the student attempts to access a download URL directly, the
         system rejects the request with a 403 Forbidden response.

  4a. The signed URL has expired:
      1. The system generates a new signed URL and retries the download.

  4b. The file has been removed by the instructor since the page was loaded:
      1. The system displays: "This material is no longer available."
      2. The use case ends.
```
