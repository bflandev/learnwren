export const EMAIL_TRANSPORT = Symbol.for('learnwren.api-auth.email-transport');

export interface UnlockEmailInput {
  to: string;
  unlockUrl: string;
  unlockAvailableAt: Date;
}

export interface EmailTransport {
  sendUnlockEmail(input: UnlockEmailInput): Promise<void>;
}
