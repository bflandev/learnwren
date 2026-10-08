/** One sidecar `<track>` for the video player. */
export interface CaptionTrack {
  src: string;
  srclang: string;
  label: string;
}

/** Map a video's caption metadata to player tracks served by the playback API. */
export function toCaptionTracks(
  videoId: string,
  captions: readonly { language: string; label: string }[],
): CaptionTrack[] {
  return captions.map((c) => ({
    src: `/api/playback/captions/${videoId}/${c.language}`,
    srclang: c.language,
    label: c.label,
  }));
}
