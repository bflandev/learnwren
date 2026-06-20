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
  it('MaterialException sets its name (exception filters dispatch on it)', () => {
    const e = new MaterialException('MATERIAL_NOT_FOUND', 'whatever', 404);
    expect(e.name).toBe('MaterialException');
  });

  it('MaterialNotFoundException maps to 404 MATERIAL_NOT_FOUND', () => {
    const e = new MaterialNotFoundException();
    expect(e).toBeInstanceOf(MaterialException);
    expect(e.name).toBe('MaterialException');
    expect(e.code).toBe('MATERIAL_NOT_FOUND');
    expect(e.status).toBe(404);
    expect(e.message).toBe('Material not found.');
  });

  it('NotMaterialOwnerException maps to 403 NOT_MATERIAL_OWNER', () => {
    const e = new NotMaterialOwnerException();
    expect(e.code).toBe('NOT_MATERIAL_OWNER');
    expect(e.status).toBe(403);
    expect(e.message).toBe('You do not have access to this material.');
  });

  it('UnsupportedMaterialTypeException maps to 400 UNSUPPORTED_MATERIAL_TYPE', () => {
    const e = new UnsupportedMaterialTypeException();
    expect(e.code).toBe('UNSUPPORTED_MATERIAL_TYPE');
    expect(e.status).toBe(400);
    expect(e.message).toBe(
      'Unsupported file type. Supported formats: PDF, DOCX, PPTX, XLSX, TXT, ZIP.',
    );
  });

  it('InvalidMaterialStateException carries the current state in details', () => {
    const e = new InvalidMaterialStateException('READY');
    expect(e.code).toBe('INVALID_MATERIAL_STATE');
    expect(e.status).toBe(409);
    expect(e.details).toEqual({ currentState: 'READY' });
    expect(e.message).toBe('Operation is not valid in state READY.');
  });

  it('UploadObjectMissingException maps to 422', () => {
    expect(new UploadObjectMissingException().status).toBe(422);
    expect(new UploadObjectMissingException().code).toBe('UPLOAD_OBJECT_MISSING');
    expect(new UploadObjectMissingException().message).toBe(
      'No uploaded object exists at the upload destination.',
    );
  });

  it('UploadObjectSizeMismatchException maps to 422', () => {
    expect(new UploadObjectSizeMismatchException().status).toBe(422);
    expect(new UploadObjectSizeMismatchException().code).toBe('UPLOAD_OBJECT_SIZE_MISMATCH');
    expect(new UploadObjectSizeMismatchException().message).toBe(
      'Uploaded object size exceeds the allowed limit.',
    );
  });
});
