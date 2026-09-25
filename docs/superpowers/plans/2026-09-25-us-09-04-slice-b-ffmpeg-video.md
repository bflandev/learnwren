# US-09-04 Slice B — implementation plan

Spec: `../specs/2026-09-25-us-09-04-slice-b-ffmpeg-video-design.md`. TDD per task; `nx typecheck api-courses` after each.

- [ ] 1. `video.config.ts`: `TranscoderImpl` gains `ffmpeg`; `sourceProbeImpl` gains `local`; new `segmentDelivery: 'signed' | 'proxy'`; derivations and validation per spec §3.1. Tests first in `video.config.spec.ts`.
- [ ] 2. `hls-naming.ts`: add `hlsStreamInf(rendition)` and a `RENDITION_RESOLUTIONS` map; the fake storage adapter uses it (no behaviour change).
- [ ] 3. `errors`: `SEGMENT_NOT_FOUND` code + `SegmentNotFoundException`.
- [ ] 4. `manifest.rewriter.ts`: export `SAFE_SEGMENT_NAME`.
- [ ] 5. `video-storage.adapter.ts`: `openObjectReadStream`, `downloadObject`, `uploadFile`; `probeSource` `local` branch. Tests.
- [ ] 6. `transcoder/ffmpeg-transcoder.adapter.ts` + spec (unit, seams mocked).
- [ ] 7. `transcoder/ffmpeg-transcoder.integration.spec.ts` (real ffmpeg, local fs storage port).
- [ ] 8. `transcoder/ffmpeg-event.bridge.ts` + spec.
- [ ] 9. `manifest.service.ts`: proxy signer. Tests.
- [ ] 10. `playback.controller.ts`: segment route. Tests.
- [ ] 11. `video.module.ts` wiring; `package.json` dependency; `docker-compose.yml`, `.env.tpl`, `.env.example`.
- [ ] 12. Gates: affected lint/test/typecheck/build, guard-coverage spec, api-e2e on emulators, Stryker on api-courses new files.
- [ ] 13. Compose end-to-end: upload → READY → play in headless Chromium.
- [ ] 14. Docs: README, USER_GUIDE, self-hosting.md, epic AC, spec-drift note if needed.
