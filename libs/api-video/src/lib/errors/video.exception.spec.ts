import { describe, expect, test } from 'vitest';

import {
  InvalidVideoStateException,
  LessonAlreadyHasVideoException,
  NotVideoOwnerException,
  UploadObjectMissingException,
  UploadObjectSizeMismatchException,
  VideoException,
  VideoNotFoundException,
} from './video.exception';

describe('Video exceptions', () => {
  const cases: Array<[VideoException, { code: string; status: number }]> = [
    [new VideoNotFoundException(), { code: 'VIDEO_NOT_FOUND', status: 404 }],
    [new NotVideoOwnerException(), { code: 'NOT_VIDEO_OWNER', status: 403 }],
    [new LessonAlreadyHasVideoException(), { code: 'LESSON_ALREADY_HAS_VIDEO', status: 409 }],
    [new InvalidVideoStateException('UPLOADED'), { code: 'INVALID_VIDEO_STATE', status: 409 }],
    [new UploadObjectMissingException(), { code: 'UPLOAD_OBJECT_MISSING', status: 422 }],
    [new UploadObjectSizeMismatchException(), { code: 'UPLOAD_OBJECT_SIZE_MISMATCH', status: 422 }],
  ];
  test.each(cases)('exposes the expected code and status', (ex, expected) => {
    expect(ex.code).toBe(expected.code);
    expect(ex.status).toBe(expected.status);
  });
});
