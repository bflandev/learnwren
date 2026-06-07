import type { VideoId } from '@learnwren/shared-data-models';

import { ManifestParseFailedException } from '../errors/video.exception';
import { MUX_KEY_PREFIX } from '../hls-naming';

export const ALLOWED_RENDITIONS = ['1080p', '720p', '480p', '360p'] as const;
export type RenditionName = (typeof ALLOWED_RENDITIONS)[number];

export function isAllowedRendition(name: string): name is RenditionName {
  return (ALLOWED_RENDITIONS as readonly string[]).includes(name);
}

function assertM3u8Header(body: string): void {
  if (!body.startsWith('#EXTM3U')) {
    throw new ManifestParseFailedException('missing #EXTM3U header');
  }
}

function renditionNameFromUri(uri: string): string {
  // GCP Transcoder writes each HLS variant playlist FLAT at the output root,
  // named after the mux-stream key: `hls_<rendition>.m3u8` (see hls-naming.ts).
  // Tolerate an unexpected leading directory, then strip the `hls_` prefix and
  // the `.m3u8` extension to recover the rendition name.
  const base = uri.slice(uri.lastIndexOf('/') + 1);
  if (!base.endsWith('.m3u8')) {
    throw new ManifestParseFailedException(
      `cannot extract rendition name from URI "${uri}"`,
    );
  }
  const stem = base.slice(0, -'.m3u8'.length);
  const rendition = stem.startsWith(MUX_KEY_PREFIX)
    ? stem.slice(MUX_KEY_PREFIX.length)
    : stem;
  if (!rendition) {
    throw new ManifestParseFailedException(
      `cannot extract rendition name from URI "${uri}"`,
    );
  }
  return rendition;
}

export function rewriteMaster(masterBody: string, videoId: VideoId): string {
  assertM3u8Header(masterBody);
  const out: string[] = [];
  const lines = masterBody.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    out.push(line);
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      const nextIdx = i + 1;
      const uri = lines[nextIdx]?.trim();
      if (!uri || uri.startsWith('#')) {
        throw new ManifestParseFailedException(
          'expected URI line after #EXT-X-STREAM-INF',
        );
      }
      const rendition = renditionNameFromUri(uri);
      if (!isAllowedRendition(rendition)) {
        throw new ManifestParseFailedException(
          `unknown rendition "${rendition}" in master`,
        );
      }
      out.push(`/api/playback/manifest/${videoId}/rendition/${rendition}`);
      i++; // skip the original URI line
    }
  }
  return out.join('\n');
}

export type SegmentSigner = (filename: string) => Promise<string>;

/**
 * A safe HLS segment filename is a FLAT object name in the video's output
 * directory: only [A-Za-z0-9._-] plus a `.ts`/`.m4s`/`.mp4` extension — no
 * slash, backslash, `..`, scheme, leading slash, or query string. GCP writes
 * exactly this shape (e.g. `hls_720p0000000000.ts`, see hls-naming.ts) and the
 * fake adapter mirrors it. Anything else would be a capability-URL-minting
 * path traversal once interpolated into `${baseDir}/${filename}` and signed, so
 * it is rejected. Defense in depth: the playlist body is trusted (GCP output
 * bucket) today, but the signer mints credentialed read URLs.
 */
const SAFE_SEGMENT_NAME = /^[A-Za-z0-9._-]+\.(ts|m4s|mp4)$/;

function assertSafeSegmentName(name: string): void {
  if (!SAFE_SEGMENT_NAME.test(name)) {
    throw new ManifestParseFailedException(`unsafe segment filename "${name}"`);
  }
}

function isSegmentUri(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith('#')) return false;
  if (t.startsWith('http://') || t.startsWith('https://')) return false;
  return true;
}

function rewriteKeyDirective(line: string, videoId: VideoId): string {
  // Match URI="…" tolerantly. METHOD=NONE has no URI= clause, so this is a no-op for it.
  return line.replace(/URI="[^"]*"/, `URI="/api/playback/keys/${videoId}"`);
}

export async function rewriteRendition(
  renditionBody: string,
  videoId: VideoId,
  signSegment: SegmentSigner,
): Promise<string> {
  assertM3u8Header(renditionBody);
  const out: string[] = [];
  const lines = renditionBody.split('\n');
  for (const line of lines) {
    if (line.startsWith('#EXT-X-KEY')) {
      out.push(rewriteKeyDirective(line, videoId));
    } else if (isSegmentUri(line)) {
      const name = line.trim();
      assertSafeSegmentName(name);
      out.push(await signSegment(name));
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}
