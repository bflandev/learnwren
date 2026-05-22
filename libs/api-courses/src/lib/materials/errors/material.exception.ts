import type { MaterialErrorCode } from './material-error.codes';

export class MaterialException extends Error {
  constructor(
    public readonly code: MaterialErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MaterialException';
  }
}

export class UnsupportedMaterialTypeException extends MaterialException {
  constructor() {
    super(
      'UNSUPPORTED_MATERIAL_TYPE',
      'Unsupported file type. Supported formats: PDF, DOCX, PPTX, XLSX, TXT, ZIP.',
      400,
    );
  }
}

export class MaterialNotFoundException extends MaterialException {
  constructor() {
    super('MATERIAL_NOT_FOUND', 'Material not found.', 404);
  }
}

export class NotMaterialOwnerException extends MaterialException {
  constructor() {
    super('NOT_MATERIAL_OWNER', 'You do not have access to this material.', 403);
  }
}

export class InvalidMaterialStateException extends MaterialException {
  constructor(currentState: string) {
    super(
      'INVALID_MATERIAL_STATE',
      `Operation is not valid in state ${currentState}.`,
      409,
      { currentState },
    );
  }
}

export class UploadObjectMissingException extends MaterialException {
  constructor() {
    super(
      'UPLOAD_OBJECT_MISSING',
      'No uploaded object exists at the upload destination.',
      422,
    );
  }
}

export class UploadObjectSizeMismatchException extends MaterialException {
  constructor() {
    super(
      'UPLOAD_OBJECT_SIZE_MISMATCH',
      'Uploaded object size exceeds the allowed limit.',
      422,
    );
  }
}
