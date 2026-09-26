> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# US-09-04: Self-Hosting — Slice C Design (S3-compatible object storage)

**Date:** 2026-09-26
**Story:** [US-09-04](../../epics/09-non-functional-requirements.md#us-09-04-open-source-and-self-hosting) (EP-09, Non-Functional Requirements)
**Builds on:** [Slice A](./2026-09-25-us-09-04-self-hosting-design.md) (Compose), [Slice B](./2026-09-25-us-09-04-slice-b-ffmpeg-video-design.md) (ffmpeg video)
**Status:** Design approved 2026-09-26 ("S3 store, uploads via api").

---

## 1. Goal and scope

After Slice B the self-hosted stack still keeps every uploaded file in the
Firebase Storage *emulator*, a development tool. Slice C replaces it with any
S3-compatible object store — MinIO in the Compose stack — behind a single
port, without changing the web app and without exposing the store to
browsers. Firebase Auth and Firestore remain on the emulators; that is the
last gap and a later programme.

Three cuts were offered; the user chose the first:

| Cut | Decision |
| :--- | :--- |
| **S3 store, uploads via api** | **This slice.** |
| S3 store, presigned direct-to-bucket uploads (web clients rewritten to S3 multipart, bucket internet-facing) | Declined. |
| Skip storage, start on auth/data | Later. |

## 2. Constraints found in the code (surveyed at `fca000b`)

- Six places hold the Firebase Storage handle (`FIREBASE_STORAGE`): the
  cover, picture, materials and video storage adapters, the admin health
  probe, and the fake-materials passthrough controller. Between them they use
  ten SDK calls: `save`, `upload`, `download`, `createReadStream`,
  `getMetadata`, `delete`, `deleteFiles`, `getFiles`, `getSignedUrl`,
  `createResumableUpload`.
- The browser video client (`libs/web-video/.../video-upload.service.ts`)
  speaks the GCS resumable protocol: 8 MB `PUT`s with
  `Content-Range: bytes a-b/total`, treating `200` and `308` as success and
  retrying `0`/`5xx`. It does not read the `Range` response header.
- The browser materials client does a single `PUT` of the whole file (≤ 50 MB)
  to whatever URL the api returns, with `Content-Type` set.
- Materials already have an api passthrough (`FakeMaterialsController`,
  `PUT`/`GET /api/internal/fake-materials/:matId`) mounted only in fake mode.
- Covers and pictures are public reads: the browser loads
  `<publicBaseUrl>/<path>` directly.
- Segments are already proxied through the api in ffmpeg mode (Slice B).
- S3 SigV4 signs the host, so presigned URLs would tie the browser to the
  store's address; the chosen cut avoids presigning entirely in S3 mode.

## 3. Design

### 3.1 New lib `libs/api-object-storage` (`@learnwren/api-object-storage`)

| Export | Role |
| :--- | :--- |
| `OBJECT_STORAGE` token, `ObjectStorage` port | The one storage interface every adapter depends on. |
| `GcsObjectStorage` | Wraps the Firebase Storage handle; behaviour identical to today's direct SDK calls. |
| `S3ObjectStorage` | `@aws-sdk/client-s3` with `forcePathStyle`; `@aws-sdk/lib-storage` `Upload` for streams; multipart create/part/complete/abort for the chunked video route. |
| `readObjectStorageConfigFromEnv` | `LEARNWREN_OBJECT_STORAGE=gcs\|s3` (default `gcs`); for `s3`: `LEARNWREN_S3_ENDPOINT`, `LEARNWREN_S3_ACCESS_KEY`, `LEARNWREN_S3_SECRET_KEY`, `LEARNWREN_S3_REGION` (default `us-east-1`). Fails startup when `s3` is chosen and any of the three is missing. |
| `ObjectStorageModule` | Global module providing `OBJECT_STORAGE` from the config; the GCS branch injects `FIREBASE_STORAGE`. Also mounts `PublicMediaController`. |
| `PublicMediaController` | `GET /api/media/:bucket/:key`: anonymous reads from `LEARNWREN_PUBLIC_BUCKETS` only. |

Port (all inputs take `{ bucket, path }`):
`putObject(body, contentType, cacheControl?, metadata?)`, `putFile(localPath,
contentType)`, `putStream(stream, contentType)`, `getObject(): Buffer`,
`downloadToFile(destination)`, `openReadStream()`, `headObject(): {size} |
null`, `deleteObject()` (idempotent), `deletePrefix()`, `totalBytes(bucket)`, `ensureBucket(bucket)`,
`signReadUrl(ttlSec, disposition?, responseType?)`, `signWriteUrl(contentType,
ttlSec)`, `createResumableUpload(contentType, metadata, origin)`,
`createMultipartUpload(contentType): uploadId`, `uploadPart(uploadId,
partNumber, body): etag`, `completeMultipartUpload(uploadId, parts)`,
`abortMultipartUpload(uploadId)`, and a readonly `kind: 'gcs' | 's3'`.
`createResumableUpload` and the sign methods throw on S3 ("not used in S3
mode"); the multipart methods throw on GCS. Each adapter branches on `kind`
for the URL it hands the browser and nothing else.

### 3.2 Adapters switch to the port

Cover, picture, materials, video storage, `AdminHealthService`, and the
materials passthrough controller inject `OBJECT_STORAGE`. The four fake modes
are untouched. `FIREBASE_STORAGE` stays exported from `api-firebase` for the
GCS implementation only.

### 3.3 S3 mode: the api is the only door

| Flow | GCS mode (unchanged) | S3 mode |
| :--- | :--- | :--- |
| Video upload | GCS resumable session URL | `PUT /api/internal/uploads/videos/:vid` (new `VideoUploadProxyController`, `FirebaseSessionGuard` + `VideoOwnerGuard`). Each `Content-Range` chunk becomes one multipart part; the route answers `308` until the final byte, then completes the upload and answers `200`. Parts must arrive in order and be ≥ 5 MB except the last (the client's 8 MB chunks satisfy this); out-of-order or undersized chunks get `400`. Session state (`uploadId`, part ETags, bytes received) lives in an in-process map keyed by video id, created lazily on the first chunk. |
| Material upload | GCS signed `PUT` URL | `PUT /api/internal/uploads/materials/:matId` (the passthrough controller, renamed `MaterialsProxyController`, mounted when materials storage is `fake` **or** the store is `s3`; streams the body with `putStream` instead of buffering). |
| Material download | GCS signed `GET` URL | `GET /api/internal/downloads/materials/:matId` (same controller, `MaterialAccessGuard`, streams with `Content-Disposition: attachment`). |
| HLS segments | signed (gcp) / proxied (ffmpeg) | proxied (already). |
| Cover / picture reads | public bucket URL | `GET /api/media/:bucket/:key` (`PublicMediaController`, unauthenticated by design and on the guard-coverage allowlist), which serves only the buckets named in `LEARNWREN_PUBLIC_BUCKETS`; `LEARNWREN_*_PUBLIC_BASE_URL=http://<host>:<port>/api/media/<bucket>`. Chosen over a bucket policy + nginx proxy so no vendor-specific policy is needed. |

The passthrough's old route prefix `internal/fake-materials` is renamed to
`internal/uploads/materials` and `internal/downloads/materials`; the fake
adapter's minted URLs follow. `PUBLIC_ALLOWLIST` is unchanged — every new
route is class-guarded.

### 3.4 Compose

- `objectstore` service (`rustfs/rustfs`, S3-compatible, Apache-2.0), volume
  `objectstore-data`, credentials from `.env` (`LEARNWREN_S3_ACCESS_KEY` /
  `LEARNWREN_S3_SECRET_KEY`, defaulted), **no published ports**. MinIO was
  the plan, but its public images (Docker Hub and quay.io) were withdrawn
  during the slice; the port made the swap a Compose-only change.
- No init container: each storage adapter calls `ensureBucket` on module
  init (`HeadBucket` → `CreateBucket`), so a fresh store is usable at once
  and a wrong credential fails the api at boot.
- api: `LEARNWREN_OBJECT_STORAGE=s3`, endpoint `http://objectstore:9000`, the
  five bucket names, `LEARNWREN_PUBLIC_BUCKETS`, the two public base URLs.
- web: CSP `img-src`/`connect-src` no longer need the Storage emulator origin,
  so `LEARNWREN_STORAGE_ORIGIN` and the `LEARNWREN_STORAGE_BIND` port
  publication go away; the emulators service keeps only Auth and Firestore
  (and the UI).

### 3.5 Docs

`TECHNICAL_ARCHITECTURE.md` File Storage row: "Cloud Storage for Firebase in
the cloud deployment, or any S3-compatible store (MinIO in the Compose stack)
behind the `ObjectStorage` port; in S3 mode uploads and downloads pass
through the api." `docs/self-hosting.md`, README, USER_GUIDE, epic AC.

## 4. Ceilings, recorded on purpose

| Ceiling | Why accepted | Upgrade path |
| :--- | :--- | :--- |
| Uploads (≤ 10 GB video) stream through the api process | Keeps the store off the network and the web app unchanged | Presigned multipart direct to the store |
| Multipart session state in api memory; a restart aborts in-flight uploads (the client reports failure; the instructor re-uploads) | No new persistence; the existing failure path already handles it | Persist `uploadId` + parts on the Video document |
| Chunks must arrive in order (the client is sequential) | S3 part numbers must map to byte order | Track offsets per part |
| One region, path-style addressing | MinIO default; any S3 vendor supports it | Config flag |

## 5. Verification

- Unit: config; `S3ObjectStorage` with a mocked `send` (every command's
  input pinned, 404 → null / no-op); `GcsObjectStorage` delegating to a
  mocked handle; the video upload proxy's chunk protocol (308 progression,
  final 200, out-of-order 400, undersized 400, abort on failure); the
  materials proxy streaming; each adapter's `kind` branch.
- Guard coverage spec: no allowlist change.
- Gates: affected lint/test/typecheck/build; api-e2e on emulators (GCS mode,
  unchanged); Stryker scoped to new and changed files.
- Compose end to end, scripted: chunked 20 MB video upload through the api →
  READY → playback; material upload + download round-trip through the api;
  cover image upload → `<img>` loads via `/media/`; MinIO has no published
  port.
