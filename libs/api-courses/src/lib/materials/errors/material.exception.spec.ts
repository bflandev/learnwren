import { describe, expect, it } from 'vitest';

import {
  InvalidMaterialStateException,
  MaterialException,
  MaterialNotFoundException,
  NotMaterialOwnerException,
  UnsupportedMaterialTypeException,
  UploadObjectMissingException,
  UploadObjectSizeMismatchException,
} from './material.exception';

describe('material exceptions', () => {
  it('MaterialNotFoundException maps to 404 MATERIAL_NOT_FOUND', () => {
    const e = new MaterialNotFoundException();
    expect(e).toBeInstanceOf(MaterialException);
    expect(e.code).toBe('MATERIAL_NOT_FOUND');
    expect(e.status).toBe(404);
  });

  it('NotMaterialOwnerException maps to 403 NOT_MATERIAL_OWNER', () => {
    const e = new NotMaterialOwnerException();
    expect(e.code).toBe('NOT_MATERIAL_OWNER');
    expect(e.status).toBe(403);
  });

  it('UnsupportedMaterialTypeException maps to 400 UNSUPPORTED_MATERIAL_TYPE', () => {
    const e = new UnsupportedMaterialTypeException();
    expect(e.code).toBe('UNSUPPORTED_MATERIAL_TYPE');
    expect(e.status).toBe(400);
  });

  it('InvalidMaterialStateException carries the current state in details', () => {
    const e = new InvalidMaterialStateException('READY');
    expect(e.code).toBe('INVALID_MATERIAL_STATE');
    expect(e.status).toBe(409);
    expect(e.details).toEqual({ currentState: 'READY' });
  });

  it('UploadObjectMissingException maps to 422', () => {
    expect(new UploadObjectMissingException().status).toBe(422);
    expect(new UploadObjectMissingException().code).toBe('UPLOAD_OBJECT_MISSING');
  });

  it('UploadObjectSizeMismatchException maps to 422', () => {
    expect(new UploadObjectSizeMismatchException().status).toBe(422);
    expect(new UploadObjectSizeMismatchException().code).toBe('UPLOAD_OBJECT_SIZE_MISMATCH');
  });
});
