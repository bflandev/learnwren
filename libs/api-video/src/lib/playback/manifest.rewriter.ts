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
