import type { VideoId } from '@learnwren/shared-data-models';

import { ManifestParseFailedException } from '../errors/video.exception';

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
  // Expect 'X/playlist.m3u8' (single segment), produced by Transcoder API.
  const slash = uri.indexOf('/');
  if (slash <= 0) {
    throw new ManifestParseFailedException(
      `cannot extract rendition name from URI "${uri}"`,
    );
  }
  return uri.slice(0, slash);
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
      out.push(await signSegment(line.trim()));
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}
