import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { MATERIAL_MAX_SIZE_BYTES } from '@learnwren/shared-data-models';

import { CreateMaterialUploadDto } from './create-material-upload.dto';
import { RenameMaterialDto } from './rename-material.dto';

function errors<T extends object>(cls: new () => T, payload: unknown): string[] {
  return validateSync(plainToInstance(cls, payload)).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );
}

describe('CreateMaterialUploadDto', () => {
  it('accepts a valid payload', () => {
    expect(errors(CreateMaterialUploadDto, { filename: 'notes.pdf', sizeBytes: 1024 })).toEqual([]);
  });

  it('rejects a blank filename', () => {
    expect(errors(CreateMaterialUploadDto, { filename: '', sizeBytes: 1 }).length).toBeGreaterThan(0);
  });

  it('rejects a filename longer than 255 chars', () => {
    expect(
      errors(CreateMaterialUploadDto, { filename: 'a'.repeat(256), sizeBytes: 1 }).length,
    ).toBeGreaterThan(0);
  });

  it('rejects sizeBytes over the 50 MB limit', () => {
    expect(
      errors(CreateMaterialUploadDto, { filename: 'x.pdf', sizeBytes: MATERIAL_MAX_SIZE_BYTES + 1 })
        .length,
    ).toBeGreaterThan(0);
  });

  it('rejects a non-positive size', () => {
    expect(
      errors(CreateMaterialUploadDto, { filename: 'x.pdf', sizeBytes: 0 }).length,
    ).toBeGreaterThan(0);
  });
});

describe('RenameMaterialDto', () => {
  it('accepts a valid display name', () => {
    expect(errors(RenameMaterialDto, { displayName: 'My Worksheet' })).toEqual([]);
  });

  it('rejects a blank display name', () => {
    expect(errors(RenameMaterialDto, { displayName: '' }).length).toBeGreaterThan(0);
  });

  it('rejects a display name longer than 255 chars', () => {
    expect(
      errors(RenameMaterialDto, { displayName: 'a'.repeat(256) }).length,
    ).toBeGreaterThan(0);
  });
});
