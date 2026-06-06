/**
 * HLS output naming contract — the single source of truth shared between the
 * transcoder job builder (which tells GCP how to name its output) and the
 * playback layer (which must read that same output back).
 *
 * GCP Transcoder writes one HLS *variant* (media) playlist per mux stream,
 * named after the mux-stream key with a `.m3u8` extension, FLAT at the job's
 * output root. So mux key `hls_1080p` produces `hls_1080p.m3u8` next to the
 * master `manifest.m3u8`, and the master references that flat filename. Per the
 * Transcoder docs: "the manifest references the mux stream key" and a mux
 * stream's `fileName` "overrides the default `<key>.<ext>`".
 *
 * The playback rewriter/service must therefore NOT assume a
 * `<rendition>/playlist.m3u8` subdirectory layout — GCP never produces that.
 * Deriving the mux key / variant filename here keeps the two sides from
 * silently drifting apart (the drift that previously broke real-GCP playback,
 * masked only because the fake storage adapter invented a subdirectory layout).
 */
export const MUX_KEY_PREFIX = 'hls_';

/** The GCP mux-stream key for a rendition (e.g. '1080p' -> 'hls_1080p'). */
export function hlsMuxKey(rendition: string): string {
  return `${MUX_KEY_PREFIX}${rendition}`;
}

/** The flat variant-playlist object name GCP writes for a rendition. */
export function hlsVariantPlaylistName(rendition: string): string {
  return `${hlsMuxKey(rendition)}.m3u8`;
}
