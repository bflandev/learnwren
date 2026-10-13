import { ValidateIf } from 'class-validator';

/**
 * Skip validation only when the field is absent. Unlike @IsOptional(), which
 * also waves `null` through — a `{"title": null}` PATCH was stored as-is and
 * crashed catalogue search/sort for every visitor.
 */
export const OptionalField = (): PropertyDecorator =>
  ValidateIf((_object, value) => value !== undefined);
