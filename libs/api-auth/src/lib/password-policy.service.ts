import { Injectable } from '@nestjs/common';

export type PolicyRequirement =
  | 'MIN_LENGTH'
  | 'UPPERCASE'
  | 'LOWERCASE'
  | 'DIGIT'
  | 'SPECIAL';

export type PasswordPolicyResult =
  | { valid: true }
  | { valid: false; unmet: PolicyRequirement[] };

const MIN_LENGTH = 12;

const REQUIREMENT_ORDER: PolicyRequirement[] = [
  'MIN_LENGTH',
  'UPPERCASE',
  'LOWERCASE',
  'DIGIT',
  'SPECIAL',
];

@Injectable()
export class PasswordPolicyService {
  validate(password: string): PasswordPolicyResult {
    const unmet = new Set<PolicyRequirement>();
    if (password.length < MIN_LENGTH) unmet.add('MIN_LENGTH');
    if (!/[A-Z]/.test(password)) unmet.add('UPPERCASE');
    if (!/[a-z]/.test(password)) unmet.add('LOWERCASE');
    if (!/[0-9]/.test(password)) unmet.add('DIGIT');
    if (!/[^A-Za-z0-9]/.test(password)) unmet.add('SPECIAL');

    if (unmet.size === 0) return { valid: true };
    return {
      valid: false,
      unmet: REQUIREMENT_ORDER.filter((r) => unmet.has(r)),
    };
  }
}
