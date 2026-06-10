import { describe, expect, it, test } from 'vitest';

import {
  CaptionsNotFoundException,
  CaptionTooLargeException,
  InvalidCaptionFileException,
  InvalidVideoStateException,
  KeyLookupFailedException,
  LessonAlreadyHasVideoException,
  ManifestParseFailedException,
  NotVideoOwnerException,
  PubSubInvalidTokenException,
  PubSubWrongAudienceException,
  PubSubWrongInvokerException,
  RenditionNotFoundException,
  UploadCompletionInProgressException,
  UploadObjectMissingException,
  UploadObjectSizeMismatchException,
  VideoException,
  VideoNotFoundException,
  VideoNotReadyException,
} from './video.exception';

describe('Video exceptions', () => {
  const cases: Array<[VideoException, { code: string; status: number; message: string }]> = [
    [new VideoNotFoundException(), { code: 'VIDEO_NOT_FOUND', status: 404, message: 'Video not found.' }],
    [new NotVideoOwnerException(), { code: 'NOT_VIDEO_OWNER', status: 403, message: 'You do not own this video.' }],
    [
      new LessonAlreadyHasVideoException(),
      {
        code: 'LESSON_ALREADY_HAS_VIDEO',
        status: 409,
        message: 'This lesson already has a video. Replace flow is not yet supported.',
      },
    ],
    [
      new InvalidVideoStateException('UPLOADED'),
      { code: 'INVALID_VIDEO_STATE', status: 409, message: 'Operation is not valid in state UPLOADED.' },
    ],
    [
      new UploadObjectMissingException(),
      {
        code: 'UPLOAD_OBJECT_MISSING',
        status: 422,
        message: 'No source object exists at the upload destination.',
      },
    ],
    [
      new UploadObjectSizeMismatchException(),
      {
        code: 'UPLOAD_OBJECT_SIZE_MISMATCH',
        status: 422,
        message: 'Uploaded object size exceeds declared size by more than the allowed tolerance.',
      },
    ],
  ];
  test.each(cases)('exposes the expected code, status, and message', (ex, expected) => {
    expect(ex.code).toBe(expected.code);
    expect(ex.status).toBe(expected.status);
    expect(ex.message).toBe(expected.message);
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
    expect(e.message).toBe(
      'Pub/Sub OIDC token audience does not match the configured webhook URL.',
    );
  });

  it('PubSubWrongInvokerException has status 403 and correct code', () => {
    const e = new PubSubWrongInvokerException();
    expect(e.status).toBe(403);
    expect(e.code).toBe('PUBSUB_WRONG_INVOKER');
    expect(e.message).toBe(
      'Pub/Sub OIDC token email does not match the configured invoker service account.',
    );
  });
});

describe('slice C exceptions', () => {
  it('RenditionNotFoundException → 404 RENDITION_NOT_FOUND carries rendition detail', () => {
    const ex = new RenditionNotFoundException('xyz');
    expect(ex.status).toBe(404);
    expect(ex.code).toBe('RENDITION_NOT_FOUND');
    expect(ex.message).toBe('Rendition "xyz" is not available.');
    expect(ex.details).toEqual({ rendition: 'xyz' });
  });

  it('VideoNotReadyException → 409 VIDEO_NOT_READY carries currentState', () => {
    const ex = new VideoNotReadyException('TRANSCODING');
    expect(ex.status).toBe(409);
    expect(ex.code).toBe('VIDEO_NOT_READY');
    expect(ex.details).toEqual({ currentState: 'TRANSCODING' });
    expect(ex.message).toBe('Video is not ready for playback (current state: TRANSCODING).');
  });

  it('KeyLookupFailedException → 500 KEY_LOOKUP_FAILED, generic message without detail', () => {
    const ex = new KeyLookupFailedException();
    expect(ex.status).toBe(500);
    expect(ex.code).toBe('KEY_LOOKUP_FAILED');
    expect(ex.message).toBe('Encryption key lookup failed.');
  });

  it('KeyLookupFailedException folds an optional detail into the message', () => {
    const ex = new KeyLookupFailedException('missing key doc');
    expect(ex.message).toBe('Encryption key lookup failed: missing key doc.');
  });

  it('ManifestParseFailedException → 502 MANIFEST_PARSE_FAILED carries detail', () => {
    const ex = new ManifestParseFailedException('missing #EXTM3U');
    expect(ex.status).toBe(502);
    expect(ex.code).toBe('MANIFEST_PARSE_FAILED');
    expect(ex.message).toMatch(/missing #EXTM3U/);
  });
});

describe('upload completion in-progress exception', () => {
  it('UploadCompletionInProgressException → 409 UPLOAD_COMPLETION_IN_PROGRESS', () => {
    const ex = new UploadCompletionInProgressException();
    expect(ex.code).toBe('UPLOAD_COMPLETION_IN_PROGRESS');
    expect(ex.status).toBe(409);
    expect(ex.message).toBe('Upload completion is already being processed.');
  });
});

describe('caption exceptions', () => {
  it('InvalidCaptionFileException is a 400 with INVALID_CAPTION_FILE', () => {
    const e = new InvalidCaptionFileException();
    expect(e.code).toBe('INVALID_CAPTION_FILE');
    expect(e.status).toBe(400);
  });
  it('CaptionTooLargeException is a 400 with CAPTION_TOO_LARGE', () => {
    const e = new CaptionTooLargeException();
    expect(e.code).toBe('CAPTION_TOO_LARGE');
    expect(e.status).toBe(400);
  });
  it('CaptionsNotFoundException is a 404 with CAPTIONS_NOT_FOUND', () => {
    const e = new CaptionsNotFoundException();
    expect(e.code).toBe('CAPTIONS_NOT_FOUND');
    expect(e.status).toBe(404);
  });
});
