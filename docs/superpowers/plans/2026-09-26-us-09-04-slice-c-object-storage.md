# US-09-04 Slice C — implementation plan

Spec: `../specs/2026-09-26-us-09-04-slice-c-object-storage-design.md`. TDD per task; typecheck each touched lib.

- [x] 1. Scaffold `libs/api-object-storage`; add `@aws-sdk/client-s3`, `lib-storage`, `s3-request-presigner` (done).
- [x] 2. Port + token + config (`readObjectStorageConfigFromEnv`) with tests.
- [x] 3. `GcsObjectStorage` (wraps FIREBASE_STORAGE) with tests.
- [x] 4. `S3ObjectStorage` (mocked `send`) with tests.
- [x] 5. `ObjectStorageModule` (global) wired in `apps/api` AppModule after FirebaseAdminModule.
- [x] 6. Cover + picture adapters → port. Tests updated.
- [x] 7. Materials adapter → port; `kind === 's3'` mints proxy URLs; passthrough controller renamed/generalised (`internal/uploads|downloads/materials`), streamed. Tests.
- [x] 8. Video storage adapter → port; `kind === 's3'` session URL; `VideoUploadProxyController` with chunk protocol. Tests. Health service → `totalBytes`.
- [x] 9. Guard-coverage spec, `nx affected` gates, api-e2e.
- [x] 10. Compose: minio + minio-init, api env, nginx `/media/`, drop storage-emulator publication; `.env.example`.
- [ ] 11. Compose end-to-end script (video chunks, material round-trip, cover via /media, playback).
- [ ] 12. Stryker scoped; docs (README, USER_GUIDE, self-hosting, epic AC, TECHNICAL_ARCHITECTURE row, quality report note).
