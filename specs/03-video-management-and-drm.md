> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# EP-03: Video Management and DRM

This is the most technically complex epic. It defines the requirements for the entire video pipeline: upload, transcoding, storage, DRM encryption, and secure delivery. The platform must ensure that video content cannot be downloaded or redistributed outside of the authorised player.

---

## US-03-01: Upload a Video to a Lesson

> **As an** Instructor, **I want to** upload a video file to a lesson **so that** students can watch the instructional content.

**Acceptance Criteria (Conditions of Satisfaction):**

- Supported upload formats include MP4 (H.264/H.265), MOV, and MKV.
- The maximum file size per video is 10 GB.
- The upload uses a chunked, resumable protocol so that large files can be uploaded reliably over slow connections.
- A progress bar displays the upload percentage in real time.
- The Instructor receives a notification (in-app and by email) when the video has finished processing.
- If the upload fails, the Instructor can resume from where it left off without re-uploading the entire file.

---

## US-03-02: Automatic Video Transcoding

> **As a** Platform, **I want to** automatically transcode uploaded videos into multiple resolutions **so that** students on any device or connection speed can watch them smoothly.

**Acceptance Criteria (Conditions of Satisfaction):**

- Upon successful upload, the video is automatically queued for transcoding.
- The transcoding pipeline produces the following output resolutions: 1080p, 720p, 480p, and 360p.
- The output is packaged in both **HLS** (HTTP Live Streaming, `.m3u8`) and **MPEG-DASH** (`.mpd`) adaptive formats.
- The original source file is retained in cold storage for re-processing.
- Transcoded files are stored in a dedicated object storage system (e.g., MinIO or S3-compatible storage).
- The lesson is not visible to students until transcoding is complete.

---

## US-03-03: DRM Encryption of Video Content

> **As a** Platform Administrator, **I want** all video content to be encrypted with industry-standard DRM **so that** the content cannot be downloaded or played outside of the authorised player.

**Acceptance Criteria (Conditions of Satisfaction):**

- After transcoding, all video segments are encrypted using **Common Encryption (CENC)** with AES-CTR mode for DASH (supporting Widevine and PlayReady) and **CBCS** mode for HLS (supporting FairPlay).
- Encryption keys are generated per video and stored in a secure key management service, never in the same storage as the video files.
- The DRM system supports the three major DRM technologies: **Google Widevine** (Chrome, Android, Smart TVs), **Microsoft PlayReady** (Edge, Windows, Xbox), and **Apple FairPlay** (Safari, iOS, macOS, tvOS).
- The DASH manifest (`.mpd`) embeds `<ContentProtection>` elements with PSSH data for both Widevine and PlayReady.
- The HLS manifest (`.m3u8`) includes an `EXT-X-KEY` tag referencing the FairPlay key URI.
- A DRM license server issues decryption licenses only to authenticated and enrolled users.

---

## US-03-04: Secure Video Playback

> **As a** Student, **I want to** watch course videos in a smooth, high-quality player **so that** I can focus on learning without technical interruptions.

**Acceptance Criteria (Given / When / Then):**

- **Given** I am enrolled in a course and navigate to a lesson,
- **When** I click the play button,
- **Then** the player requests a short-lived playback token from the backend.
- **And** the player uses the token to request a DRM license from the license server.
- **And** video playback begins within 3 seconds on a standard broadband connection.

- **Given** my internet connection speed changes during playback,
- **When** the player detects a bandwidth drop,
- **Then** the player automatically switches to a lower resolution without interrupting playback.

- **Given** I am not enrolled in the course,
- **When** I attempt to access the video URL directly,
- **Then** the request is rejected with a 403 Forbidden response and no video data is served.

- The player must not expose the video source URL or decryption key in any browser-accessible context.
- The player must prevent right-click download and screenshot capture (via Encrypted Media Extensions).

---

## US-03-05: Video Storage Management

> **As a** Platform Administrator, **I want** video files to be stored in a cost-efficient, scalable object store **so that** the platform can grow without requiring expensive proprietary storage.

**Acceptance Criteria (Conditions of Satisfaction):**

- The platform uses an S3-compatible object storage backend (e.g., MinIO for self-hosted deployments).
- Raw source files are stored in a separate bucket from transcoded output files.
- Transcoded files are served through a CDN or a reverse proxy with signed, time-limited URLs to prevent hotlinking.
- Administrators can view total storage usage from the admin panel.
- Deleted videos are moved to a "soft-deleted" state for 30 days before permanent removal, to allow recovery.
