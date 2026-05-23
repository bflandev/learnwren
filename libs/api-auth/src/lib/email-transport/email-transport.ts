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

export interface EmailTransport {
  sendUnlockEmail(input: UnlockEmailInput): Promise<void>;
  sendVerificationEmail(input: VerificationEmailInput): Promise<void>;
}
