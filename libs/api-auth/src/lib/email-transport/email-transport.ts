export const EMAIL_TRANSPORT = Symbol.for('learnwren.api-auth.email-transport');

export interface UnlockEmailInput {
  to: string;
  unlockUrl: string;
  unlockAvailableAt: Date;
}

export interface VerificationEmailInput {
  to: string;
  verificationUrl: string;
}

export interface PasswordResetEmailInput {
  to: string;
  resetUrl: string;
}

export interface EmailChangeVerificationEmailInput {
  to: string; // the NEW address
  verificationUrl: string;
}

export interface PasswordChangedEmailInput {
  to: string; // the account address (unchanged by this flow)
}

export interface InstructorApplicationApprovedEmailInput {
  to: string;
}

export interface InstructorApplicationDeclinedEmailInput {
  to: string;
}

export interface EmailTransport {
  sendUnlockEmail(input: UnlockEmailInput): Promise<void>;
  sendVerificationEmail(input: VerificationEmailInput): Promise<void>;
  sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void>;
  sendEmailChangeVerificationEmail(input: EmailChangeVerificationEmailInput): Promise<void>;
  sendPasswordChangedEmail(input: PasswordChangedEmailInput): Promise<void>;
  sendInstructorApplicationApprovedEmail(
    input: InstructorApplicationApprovedEmailInput,
  ): Promise<void>;
  sendInstructorApplicationDeclinedEmail(
    input: InstructorApplicationDeclinedEmailInput,
  ): Promise<void>;
}
