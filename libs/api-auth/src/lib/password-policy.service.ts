import { Injectable } from '@nestjs/common';

import { evaluatePasswordPolicy } from '@learnwren/shared-data-models';
export type { PolicyRequirement } from '@learnwren/shared-data-models';
import type { PolicyRequirement } from '@learnwren/shared-data-models';

export type PasswordPolicyResult =
  | { valid: true }
  | { valid: false; unmet: PolicyRequirement[] };

@Injectable()
export class PasswordPolicyService {
  validate(password: string): PasswordPolicyResult {
    const unmet = evaluatePasswordPolicy(password);
    if (unmet.length === 0) return { valid: true };
    return { valid: false, unmet };
  }
}
