import type { PolicyRequirement } from './profile';

/**
 * Canonical password-complexity policy (UC-01-01 step 4). Single source of
 * truth shared by api-auth's PasswordPolicyService and web-auth's
 * passwordPolicyValidator so the two can never drift. Framework-free: pure
 * constants + one pure function (no NestJS, Angular, or class-validator).
 */

/** Minimum password length. */
export const PASSWORD_MIN_LENGTH = 12;

/** Canonical display/return order of policy requirements. */
export const PASSWORD_REQUIREMENT_ORDER: PolicyRequirement[] = [
  'MIN_LENGTH',
  'UPPERCASE',
  'LOWERCASE',
  'DIGIT',
  'SPECIAL',
];

/**
 * Returns the UNMET requirements for `password`, in canonical order.
 * An empty array means the password satisfies every requirement.
 */
export function evaluatePasswordPolicy(password: string): PolicyRequirement[] {
  const unmet = new Set<PolicyRequirement>();
  if (password.length < PASSWORD_MIN_LENGTH) unmet.add('MIN_LENGTH');
  if (!/[A-Z]/.test(password)) unmet.add('UPPERCASE');
  if (!/[a-z]/.test(password)) unmet.add('LOWERCASE');
  if (!/[0-9]/.test(password)) unmet.add('DIGIT');
  if (!/[^A-Za-z0-9]/.test(password)) unmet.add('SPECIAL');

  return PASSWORD_REQUIREMENT_ORDER.filter((r) => unmet.has(r));
}
