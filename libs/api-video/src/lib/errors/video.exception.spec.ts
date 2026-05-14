import { describe, expect, it, test } from 'vitest';

import {
  InvalidVideoStateException,
  LessonAlreadyHasVideoException,
  NotVideoOwnerException,
  PubSubInvalidTokenException,
  PubSubWrongAudienceException,
  PubSubWrongInvokerException,
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

  it('VideoException carries code, message, status, and optional details', () => {
    const ex = new VideoException('INTERNAL', 'boom', 500, { foo: 'bar' });
    expect(ex.code).toBe('INTERNAL');
    expect(ex.message).toBe('boom');
    expect(ex.status).toBe(500);
    expect(ex.details).toEqual({ foo: 'bar' });
    expect(ex.name).toBe('VideoException');
  });

  it('InvalidVideoStateException attaches currentState to details', () => {
    const ex = new InvalidVideoStateException('UPLOADED');
    expect(ex.details).toEqual({ currentState: 'UPLOADED' });
  });
});

describe('Pub/Sub exceptions', () => {
  it('PubSubInvalidTokenException has status 401 and correct code', () => {
    const e = new PubSubInvalidTokenException('expired');
    expect(e.status).toBe(401);
    expect(e.code).toBe('PUBSUB_INVALID_TOKEN');
    expect(e.message).toContain('expired');
  });

  it('PubSubInvalidTokenException without detail uses generic message', () => {
    const e = new PubSubInvalidTokenException();
    expect(e.message).toBe('Pub/Sub OIDC token invalid.');
  });

  it('PubSubWrongAudienceException has status 403 and correct code', () => {
    const e = new PubSubWrongAudienceException();
    expect(e.status).toBe(403);
    expect(e.code).toBe('PUBSUB_WRONG_AUDIENCE');
  });

  it('PubSubWrongInvokerException has status 403 and correct code', () => {
    const e = new PubSubWrongInvokerException();
    expect(e.status).toBe(403);
    expect(e.code).toBe('PUBSUB_WRONG_INVOKER');
  });
});
