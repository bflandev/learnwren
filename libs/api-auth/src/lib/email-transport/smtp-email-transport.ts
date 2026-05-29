import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import type {
  EmailChangeVerificationEmailInput,
  EmailTransport,
  PasswordChangedEmailInput,
  PasswordResetEmailInput,
  UnlockEmailInput,
  VerificationEmailInput,
} from './email-transport';

export interface SmtpEmailTransportConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

@Injectable()
export class SmtpEmailTransport implements EmailTransport {
  private readonly logger = new Logger('SmtpEmailTransport');
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpEmailTransportConfig) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      auth: { user: config.user, pass: config.password },
    });
  }

  async sendUnlockEmail(input: UnlockEmailInput): Promise<void> {
    const text =
      `There were 3 unsuccessful sign-in attempts on your Learn Wren account.\n\n` +
      `It will unlock automatically at ${input.unlockAvailableAt.toISOString()}. ` +
      `If this wasn't you, you can unlock immediately and reset your password ` +
      `using the link below:\n\n${input.unlockUrl}\n\n` +
      `If you didn't try to sign in, please change your password.`;

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: input.to,
        subject: 'Your Learn Wren account is temporarily locked',
        text,
      });
      this.logger.log(`[unlock-email] sent to=${input.to}`);
    } catch (err) {
      this.logger.error(`[unlock-email] send failed to=${input.to}: ${String(err)}`);
      throw err;
    }
  }

  async sendVerificationEmail(input: VerificationEmailInput): Promise<void> {
    const text =
      `Welcome to Learn Wren!\n\n` +
      `Please verify your email address by clicking the link below:\n\n` +
      `${input.verificationUrl}\n\n` +
      `You won't be able to sign in until your email is verified.`;

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: input.to,
        subject: 'Verify your Learn Wren email address',
        text,
      });
      this.logger.log(`[verification-email] sent to=${input.to}`);
    } catch (err) {
      this.logger.error(
        `[verification-email] send failed to=${input.to}: ${String(err)}`,
      );
      throw err;
    }
  }

  async sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
    const text =
      `Someone — hopefully you — asked to reset the password on your Learn Wren account.\n\n` +
      `Click the link below to choose a new password:\n\n` +
      `${input.resetUrl}\n\n` +
      `If you didn't request this, you can safely ignore this email.`;

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: input.to,
        subject: 'Reset your Learn Wren password',
        text,
      });
      this.logger.log(`[password-reset-email] sent to=${input.to}`);
    } catch (err) {
      this.logger.error(
        `[password-reset-email] send failed to=${input.to}: ${String(err)}`,
      );
      throw err;
    }
  }

  async sendEmailChangeVerificationEmail(
    input: EmailChangeVerificationEmailInput,
  ): Promise<void> {
    const text =
      `You asked to change the email address on your Learn Wren account.\n\n` +
      `Confirm this new address by clicking the link below:\n\n` +
      `${input.verificationUrl}\n\n` +
      `Your current address stays active until you confirm. ` +
      `If you didn't request this, you can safely ignore this email.`;

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: input.to,
        subject: 'Confirm your new Learn Wren email address',
        text,
      });
      this.logger.log(`[email-change-email] sent to=${input.to}`);
    } catch (err) {
      this.logger.error(`[email-change-email] send failed to=${input.to}: ${String(err)}`);
      throw err;
    }
  }

  async sendPasswordChangedEmail(input: PasswordChangedEmailInput): Promise<void> {
    const text =
      `The password on your Learn Wren account was just changed.\n\n` +
      `If this was you, no action is needed. You've been signed out on all devices ` +
      `and can sign in again with your new password.\n\n` +
      `If you did NOT change your password, reset it immediately using "Forgot password" ` +
      `on the sign-in page.`;

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: input.to,
        subject: 'Your Learn Wren password was changed',
        text,
      });
      this.logger.log(`[password-changed-email] sent to=${input.to}`);
    } catch (err) {
      this.logger.error(`[password-changed-email] send failed to=${input.to}: ${String(err)}`);
      throw err;
    }
  }
}
