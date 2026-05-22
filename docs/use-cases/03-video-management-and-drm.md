# EP-03: Video Management and DRM — Use Cases

This document contains the fully-dressed Cockburn use cases for the video pipeline: upload, transcoding, DRM encryption, secure playback, and storage management.

> [!NOTE]
> **DRIFT — this spec no longer matches the implementation.** Frozen 2026-03-27 and not reconciled since. These use cases assume a commercial multi-DRM architecture (Widevine/PlayReady/FairPlay, CENC/CBCS, MPEG-DASH, a license server with playback tokens, KMS-stored keys); the implementation is a deliberately scoped-down HLS + AES-128 pipeline gated by session cookies. UC-03-05 (Manage Video Storage) is unbuilt. See the [Specification Drift Report](../quality/spec-drift-report.md#ep-03--video-management-and-drm).

---

## UC-03-01 — Upload a Video to a Lesson

```
Use Case: UC-03-01 — Upload a Video to a Lesson

Goal in Context:  An instructor uploads a video file to a lesson so that
                  students can watch the instructional content.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Instructor
Preconditions:    - The instructor is authenticated and owns the course.
                  - The lesson exists and does not already have a video, or
                    the instructor is replacing an existing video.
Success End:      The video file is uploaded and queued for transcoding
                  (see UC-03-02). The instructor has been notified that
                  processing has begun.
Failed End:       No video is stored. The lesson remains without a video
                  (or retains its previous video if replacing).

Main Success Scenario:
  1. The instructor navigates to the lesson in the course editor.
  2. The instructor clicks "Upload Video."
  3. The system displays a file picker.
  4. The instructor selects a video file (MP4 with H.264/H.265, MOV, or MKV;
     max 10 GB).
  5. The system begins a chunked, resumable upload.
  6. The system displays a progress bar showing the upload percentage in
     real time.
  7. The upload completes successfully.
  8. The system queues the video for transcoding (see UC-03-02).
  9. The system displays a confirmation: "Video uploaded. Processing will
     begin shortly."
  10. The instructor receives an in-app and email notification when processing
      is complete.

Extensions:
  4a. The file format is not supported:
      1. The system displays: "Unsupported format. Please upload MP4 (H.264
         or H.265), MOV, or MKV."
      2. The use case returns to step 3.

  4b. The file exceeds 10 GB:
      1. The system displays: "File size exceeds the 10 GB limit."
      2. The use case returns to step 3.

  5a. The upload is interrupted (network failure):
      1. The system retains the uploaded chunks.
      2. The instructor can resume the upload from where it left off
         without re-uploading the entire file.
      3. The use case continues from step 5.

  7a. The upload fails after retries:
      1. The system displays: "Upload failed. Please try again."
      2. The instructor receives an email notification of the failure.
      3. The use case ends.

  1a. The lesson already has a video and the instructor is replacing it:
      1. The system displays a warning: "Replacing this video will remove
         the current video after the new one is processed."
      2. The instructor confirms the replacement.
      3. The use case continues from step 3.
      4. The old video is retained until the new video completes
         transcoding and DRM encryption.
```

---

## UC-03-02 — Transcode an Uploaded Video

```
Use Case: UC-03-02 — Transcode an Uploaded Video

Goal in Context:  The system automatically transcodes an uploaded video into
                  multiple adaptive bitrate resolutions for cross-device
                  playback.
Scope:            Learn Wren Platform
Level:            Subfunction
Primary Actor:    System
Preconditions:    - A video has been successfully uploaded (see UC-03-01).
                  - The video is in the transcoding queue.
Success End:      The video has been transcoded into 1080p, 720p, 480p, and
                  360p resolutions in both HLS and MPEG-DASH formats. The
                  original source is retained in cold storage. The transcoded
                  files are stored in object storage.
Failed End:       Transcoding has failed. The lesson remains invisible to
                  students. The instructor is notified of the failure.

Main Success Scenario:
  1. The system picks up the video from the transcoding queue.
  2. The system transcodes the video into four output resolutions: 1080p,
     720p, 480p, and 360p.
  3. The system packages each resolution into HLS (.m3u8) and MPEG-DASH
     (.mpd) adaptive streaming formats.
  4. The system stores the transcoded files in a dedicated object storage
     bucket (separate from source files).
  5. The system retains the original source file in cold storage for
     potential re-processing.
  6. The system passes the transcoded files to DRM encryption (see UC-03-03).

Extensions:
  2a. Transcoding fails (corrupt file, unsupported codec variant):
      1. The system marks the transcoding job as failed.
      2. The system sends an in-app and email notification to the instructor:
         "Video processing failed. Please try uploading again."
      3. The lesson remains invisible to students.
      4. The use case ends.

  2b. The transcoding queue has more than 10 pending jobs:
      1. The system sends an alert to the platform administrator.
      2. Transcoding continues in queue order (FIFO).

  Note: The lesson is not visible to students until both transcoding and
  DRM encryption are complete.
```

---

## UC-03-03 — Encrypt Video with DRM

```
Use Case: UC-03-03 — Encrypt Video with DRM

Goal in Context:  The system encrypts transcoded video content with
                  industry-standard DRM to prevent unauthorised redistribution.
Scope:            Learn Wren Platform
Level:            Subfunction
Primary Actor:    System
Preconditions:    - The video has been successfully transcoded (see UC-03-02).
                  - Transcoded files are available in object storage.
Success End:      All video segments are encrypted. Encryption keys are stored
                  in a secure key management service. DRM manifests are
                  configured for Widevine, PlayReady, and FairPlay. The lesson
                  becomes visible to enrolled students.
Failed End:       Encryption has failed. The lesson remains invisible to
                  students. The instructor is notified.

Main Success Scenario:
  1. The system receives the transcoded files from UC-03-02.
  2. The system generates a unique encryption key for this video.
  3. The system stores the encryption key in a secure key management service
     (separate from video file storage).
  4. The system encrypts DASH segments using Common Encryption (CENC) with
     AES-CTR mode (supporting Widevine and PlayReady).
  5. The system encrypts HLS segments using CBCS mode (supporting FairPlay).
  6. The system updates the DASH manifest (.mpd) with ContentProtection
     elements and PSSH data for Widevine and PlayReady.
  7. The system updates the HLS manifest (.m3u8) with an EXT-X-KEY tag
     referencing the FairPlay key URI.
  8. The system marks the lesson as ready for playback.
  9. The system sends an in-app and email notification to the instructor:
     "Your video is ready."

Extensions:
  2a. Key generation fails:
      1. The system retries key generation up to 3 times.
      2. If all retries fail, the system marks the job as failed and
         notifies the instructor.
      3. The lesson remains invisible.
      4. The use case ends.

  4a. Encryption fails for one or more segments:
      1. The system marks the encryption job as failed.
      2. The system notifies the instructor: "Video processing failed.
         Please try uploading again."
      3. The lesson remains invisible.
      4. The use case ends.
```

---

## UC-03-04 — Play a DRM-Protected Video

```
Use Case: UC-03-04 — Play a DRM-Protected Video

Goal in Context:  An enrolled student watches a DRM-protected lesson video
                  with adaptive bitrate streaming.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Student
Preconditions:    - The student is authenticated.
                  - The student is enrolled in the course.
                  - The lesson video has completed transcoding and DRM
                    encryption.
Success End:      The student is watching the video. Playback started within
                  3 seconds. The video source URL and decryption keys are not
                  exposed in any browser-accessible context.
Failed End:       Playback does not start. The student sees an appropriate
                  error message.

Main Success Scenario:
  1. The student navigates to a lesson page (see UC-06-01).
  2. The student clicks the play button.
  3. The player requests a short-lived playback token from the backend.
  4. The backend verifies the student is enrolled and issues the token.
  5. The player uses the token to request a DRM license from the license
     server.
  6. The license server validates the token and issues a decryption license.
  7. The player decrypts and begins playing the video.
  8. Playback starts within 3 seconds on a standard broadband connection.

Extensions:
  4a. The student is not enrolled in the course:
      1. The backend rejects the token request with a 403 Forbidden response.
      2. The player displays: "You are not enrolled in this course."
      3. The use case ends.

  5a. The DRM license server is unavailable:
      1. The player displays: "Unable to play video. Please try again later."
      2. The use case ends.

  6a. The token has expired or is invalid:
      1. The license server rejects the request.
      2. The player requests a new playback token and retries.
      3. If the retry fails, the player displays an error message.

  8a. The student's bandwidth changes during playback:
      1. The player automatically switches to a higher or lower resolution
         without interrupting playback (adaptive bitrate).

  Note: The player prevents right-click download and does not expose the video
  source URL or decryption key in any browser-accessible context (via Encrypted
  Media Extensions).
```

---

## UC-03-05 — Manage Video Storage

```
Use Case: UC-03-05 — Manage Video Storage

Goal in Context:  An administrator monitors and manages the platform's video
                  storage to ensure cost-efficient, scalable operation.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Administrator
Preconditions:    - The user is authenticated with the Administrator role.
Success End:      The administrator has visibility into storage usage and can
                  manage the lifecycle of stored video files.
Failed End:       No changes to storage. The administrator cannot view or
                  manage storage.

Main Success Scenario:
  1. The administrator navigates to the admin panel's storage section.
  2. The system displays total storage usage, broken down by:
     - Source files (cold storage bucket)
     - Transcoded files (active storage bucket)
  3. The administrator reviews the storage metrics.

Extensions:
  3a. The administrator needs to recover a deleted video:
      1. The administrator searches for the soft-deleted video (within
         the 30-day retention window).
      2. The system displays the video's metadata and deletion date.
      3. The administrator clicks "Restore."
      4. The system restores the video to its original lesson.

  3a-1a. The 30-day retention window has passed:
      1. The system indicates the video has been permanently removed
         and cannot be recovered.

  3b. Disk usage exceeds 80%:
      1. The system displays an alert on the admin panel.
      2. The administrator reviews storage and may choose to permanently
         remove old soft-deleted files.

  Note: Transcoded files are served through a CDN or reverse proxy using
  signed, time-limited URLs to prevent hotlinking. Source and transcoded
  files are stored in separate S3-compatible buckets.
```
