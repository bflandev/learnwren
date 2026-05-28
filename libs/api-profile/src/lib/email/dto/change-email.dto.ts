/**
 * Type-shape only — intentionally NO class-validator decorators. The global
 * ValidationPipe would otherwise short-circuit with a generic BAD_REQUEST
 * before EmailChangeService can emit the feature's typed error codes.
 */
export class ChangeEmailDto {
  newEmail!: string;
  currentPassword!: string;
}
