import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { evaluatePasswordPolicy } from '@learnwren/shared-data-models';

export type { PolicyRequirement } from '@learnwren/shared-data-models';
import type { PolicyRequirement } from '@learnwren/shared-data-models';

export const PASSWORD_REQUIREMENT_PROSE: Record<PolicyRequirement, string> = {
  MIN_LENGTH: 'at least 12 characters',
  UPPERCASE: 'at least one uppercase letter',
  LOWERCASE: 'at least one lowercase letter',
  DIGIT: 'at least one digit',
  SPECIAL: 'at least one special character',
};

export function passwordPolicyValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (typeof value !== 'string') return null;

    const unmet = evaluatePasswordPolicy(value);
    if (unmet.length === 0) return null;
    return {
      passwordPolicy: { unmet },
    };
  };
}
