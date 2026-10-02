import { Injectable } from '@nestjs/common';

import { evaluatePasswordPolicy } from '@learnwren/shared-data-models';
export type { PolicyRequirement } from '@learnwren/shared-data-models';
import type { PolicyRequirement } from '@learnwren/shared-data-models';

import { PasswordTooLongException, WeakPasswordException } from './errors/auth.exception';

export type PasswordPolicyResult =
  | { valid: true }
  | { valid: false; unmet: PolicyRequirement[] };

/** Shared with register's own length check (auth.service.ts validateRegisterInput). */
export const PASSWORD_MAX = 256;

@Injectable()
export class PasswordPolicyService {
  validate(password: string): PasswordPolicyResult {
    const unmet = evaluatePasswordPolicy(password);
    if (unmet.length === 0) return { valid: true };
    return { valid: false, unmet };
  }
}

/**
 * The length + complexity check register() runs on a new password, factored
 * out so other password-setting flows (email-action reset-password) apply
 * the exact same rules without copying them. Throws PasswordTooLongException
 * or WeakPasswordException; returns normally when the password is acceptable.
 */
export function assertAcceptablePassword(policy: PasswordPolicyService, password: string): void {
  if (password.length > PASSWORD_MAX) {
    throw new PasswordTooLongException();
  }
  const result = policy.validate(password);
  if (!result.valid) {
    throw new WeakPasswordException(result.unmet);
  }
}
