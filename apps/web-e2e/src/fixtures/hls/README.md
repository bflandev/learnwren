# HLS perf fixture

A 2-second AES-128 encrypted HLS asset used by
`apps/web-e2e/src/perf/video-start.perf.spec.ts` to measure click-to-first-frame
(US-09-01: "video playback must begin within 3 seconds of clicking play").

Committed as bytes so **CI never needs ffmpeg**. Regenerate only if the player
changes in a way this no longer exercises — the numbers in the perf gate are
calibrated against these exact bytes, so a regeneration invalidates them.

`seg0.ts.bin` carries a `.bin` suffix so TypeScript tooling never mistakes an
MPEG transport stream for a `.ts` source file.

```bash
mkdir -p apps/web-e2e/src/fixtures/hls
cd apps/web-e2e/src/fixtures/hls

# A deterministic 2-second 640x360 test pattern with a silent audio track.
ffmpeg -y \
  -f lavfi -i testsrc=duration=2:size=640x360:rate=25 \
  -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -t 2 -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac \
  -shortest raw.mp4

# 16-byte AES-128 key plus the keyinfo file ffmpeg needs.
openssl rand 16 > key.bin
printf '/api/playback/keys/v-1\nkey.bin\n' > key.keyinfo

ffmpeg -y -i raw.mp4 \
  -c copy -f hls -hls_time 2 -hls_playlist_type vod \
  -hls_key_info_file key.keyinfo \
  -hls_segment_filename 'seg%d.ts' \
  720p.m3u8

rm raw.mp4 key.keyinfo
mv seg0.ts seg0.ts.bin
```

Then hand-edit `720p.m3u8` so its segment line reads `/perf-fixture/seg0.ts`
instead of `seg0.ts` — the rendition playlist production serves has absolute
segment URLs, and a rooted path is what the route handler intercepts.

`master.m3u8` is written by hand:

```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=640x360
/api/playback/manifest/v-1/rendition/720p
```

Verify the result: `cat 720p.m3u8` should show
`#EXT-X-KEY:METHOD=AES-128,URI="/api/playback/keys/v-1",IV=…`, one `#EXTINF`,
and the `/perf-fixture/seg0.ts` line. If ffmpeg produces more than one
segment, either accept them all (the stub route `**/perf-fixture/*.ts` covers
them) or re-run with a larger `-hls_time`.
