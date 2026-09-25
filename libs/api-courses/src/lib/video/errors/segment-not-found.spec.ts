import { describe, expect, it } from 'vitest';

import { SegmentNotFoundException } from './video.exception';

describe('SegmentNotFoundException', () => {
  it('is a 404 with the SEGMENT_NOT_FOUND code and the requested name', () => {
    const e = new SegmentNotFoundException('hls_720p0000000003.ts');
    expect(e.code).toBe('SEGMENT_NOT_FOUND');
    expect(e.status).toBe(404);
    expect(e.details).toEqual({ segment: 'hls_720p0000000003.ts' });
    expect(e.message).toMatch(/hls_720p0000000003\.ts/);
  });
});
