import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export type PolicyRequirement =
  | 'MIN_LENGTH'
  | 'UPPERCASE'
  | 'LOWERCASE'
  | 'DIGIT'
  | 'SPECIAL';

const MIN_LENGTH = 12;

const REQUIREMENT_ORDER: PolicyRequirement[] = [
  'MIN_LENGTH',
  'UPPERCASE',
  'LOWERCASE',
  'DIGIT',
  'SPECIAL',
];

export function passwordPolicyValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (typeof value !== 'string') return null;

    const unmet = new Set<PolicyRequirement>();
    if (value.length < MIN_LENGTH) unmet.add('MIN_LENGTH');
    if (!/[A-Z]/.test(value)) unmet.add('UPPERCASE');
    if (!/[a-z]/.test(value)) unmet.add('LOWERCASE');
    if (!/[0-9]/.test(value)) unmet.add('DIGIT');
    if (!/[^A-Za-z0-9]/.test(value)) unmet.add('SPECIAL');

    if (unmet.size === 0) return null;
    return {
      passwordPolicy: {
        unmet: REQUIREMENT_ORDER.filter((r) => unmet.has(r)),
      },
    };
  };
}
