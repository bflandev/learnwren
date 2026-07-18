import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  createTransport: mocks.createTransport,
}));

import { SmtpEmailTransport } from './smtp-email-transport';

const baseConfig = {
  host: 'smtp.example.com',
  port: 587,
  user: 'user',
  password: 'pass',
  from: 'noreply@learnwren.com',
};

describe('SmtpEmailTransport', () => {
  beforeEach(() => {
    mocks.sendMail.mockReset();
    mocks.createTransport.mockReset();
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a STARTTLS transport (secure:false, requireTLS:true) for port 587', () => {
    new SmtpEmailTransport(baseConfig); // baseConfig.port === 587
    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: baseConfig.host,
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: baseConfig.user, pass: baseConfig.password },
    });
  });

  it('creates an implicit-TLS transport (secure:true) for port 465', () => {
    new SmtpEmailTransport({ ...baseConfig, port: 465 });
    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: baseConfig.host,
      port: 465,
      secure: true,
      auth: { user: baseConfig.user, pass: baseConfig.password },
    });
  });

  describe('sendUnlockEmail', () => {
    it('sends with the unlock URL, the unlock time, and the configured from-address', async () => {
      mocks.sendMail.mockResolvedValue({ accepted: ['x'] });
      const t = new SmtpEmailTransport(baseConfig);
      await t.sendUnlockEmail({
        to: 'a@x.com',
        unlockUrl: 'https://learnwren.com/auth/unlock?token=abc',
        unlockAvailableAt: new Date('2026-05-06T01:00:00.000Z'),
      });
      expect(mocks.sendMail).toHaveBeenCalledTimes(1);
      const arg = mocks.sendMail.mock.calls[0]![0];
      expect(arg.from).toBe(baseConfig.from);
      expect(arg.to).toBe('a@x.com');
      expect(arg.subject).toContain('locked');
      expect(arg.text).toContain('https://learnwren.com/auth/unlock?token=abc');
      expect(arg.text).toContain('2026-05-06T01:00:00.000Z');
    });

    it('rethrows after logging when the transport rejects', async () => {
      mocks.sendMail.mockRejectedValue(new Error('smtp down'));
      const t = new SmtpEmailTransport(baseConfig);
      await expect(
        t.sendUnlockEmail({
          to: 'a@x.com',
          unlockUrl: 'u',
          unlockAvailableAt: new Date(),
        }),
      ).rejects.toThrow('smtp down');
    });
  });

  describe('sendVerificationEmail', () => {
    it('sends with the verification URL and the verification subject', async () => {
      mocks.sendMail.mockResolvedValue({ accepted: ['x'] });
      const t = new SmtpEmailTransport(baseConfig);
      await t.sendVerificationEmail({
        to: 'a@x.com',
        verificationUrl: 'https://learnwren.com/auth/verify?oobCode=xyz',
      });
      const arg = mocks.sendMail.mock.calls[0]![0];
      expect(arg.subject).toContain('Verify');
      expect(arg.text).toContain('https://learnwren.com/auth/verify?oobCode=xyz');
    });

    it('rethrows after logging when the transport rejects', async () => {
      mocks.sendMail.mockRejectedValue(new Error('refused'));
      const t = new SmtpEmailTransport(baseConfig);
      await expect(
        t.sendVerificationEmail({ to: 'a@x.com', verificationUrl: 'u' }),
      ).rejects.toThrow('refused');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('sends with the reset URL and the password-reset subject', async () => {
      mocks.sendMail.mockResolvedValue({ accepted: ['x'] });
      const t = new SmtpEmailTransport(baseConfig);
      await t.sendPasswordResetEmail({
        to: 'a@x.com',
        resetUrl: 'https://learnwren.com/auth/reset?oobCode=abc',
      });
      const arg = mocks.sendMail.mock.calls[0]![0];
      expect(arg.subject).toContain('Reset');
      expect(arg.text).toContain('https://learnwren.com/auth/reset?oobCode=abc');
    });

    it('rethrows after logging when the transport rejects', async () => {
      mocks.sendMail.mockRejectedValue(new Error('refused'));
      const t = new SmtpEmailTransport(baseConfig);
      await expect(
        t.sendPasswordResetEmail({ to: 'a@x.com', resetUrl: 'u' }),
      ).rejects.toThrow('refused');
    });
  });

  describe('sendEmailChangeVerificationEmail', () => {
    it('sends with the confirmation URL and the email-change subject', async () => {
      mocks.sendMail.mockResolvedValue({ accepted: ['x'] });
      const t = new SmtpEmailTransport(baseConfig);
      await t.sendEmailChangeVerificationEmail({
        to: 'new@x.com',
        verificationUrl: 'https://learnwren.com/settings/profile/email-changed?oobCode=e1',
      });
      const arg = mocks.sendMail.mock.calls[0]![0];
      expect(arg.from).toBe(baseConfig.from);
      expect(arg.to).toBe('new@x.com');
      expect(arg.subject).toContain('Confirm your new');
      expect(arg.text).toContain('https://learnwren.com/settings/profile/email-changed?oobCode=e1');
    });

    it('rethrows after logging when the transport rejects', async () => {
      mocks.sendMail.mockRejectedValue(new Error('refused'));
      const t = new SmtpEmailTransport(baseConfig);
      await expect(
        t.sendEmailChangeVerificationEmail({ to: 'a@x.com', verificationUrl: 'u' }),
      ).rejects.toThrow('refused');
    });
  });

  describe('sendPasswordChangedEmail', () => {
    it('sends the password-changed notice to the account address', async () => {
      mocks.sendMail.mockResolvedValue({ accepted: ['x'] });
      const t = new SmtpEmailTransport(baseConfig);
      await t.sendPasswordChangedEmail({ to: 'a@x.com' });
      const arg = mocks.sendMail.mock.calls[0]![0];
      expect(arg.to).toBe('a@x.com');
      expect(arg.subject).toContain('password was changed');
      expect(arg.text).toContain('signed out on all devices');
    });

    it('rethrows after logging when the transport rejects', async () => {
      mocks.sendMail.mockRejectedValue(new Error('refused'));
      const t = new SmtpEmailTransport(baseConfig);
      await expect(t.sendPasswordChangedEmail({ to: 'a@x.com' })).rejects.toThrow('refused');
    });
  });

  describe('sendInstructorApplicationApprovedEmail', () => {
    it('sends the approval notice', async () => {
      mocks.sendMail.mockResolvedValue({ accepted: ['x'] });
      const t = new SmtpEmailTransport(baseConfig);
      await t.sendInstructorApplicationApprovedEmail({ to: 'a@x.com' });
      const arg = mocks.sendMail.mock.calls[0]![0];
      expect(arg.subject).toContain('approved');
      expect(arg.text).toContain('Sign out and sign back in');
    });

    it('rethrows after logging when the transport rejects', async () => {
      mocks.sendMail.mockRejectedValue(new Error('refused'));
      const t = new SmtpEmailTransport(baseConfig);
      await expect(
        t.sendInstructorApplicationApprovedEmail({ to: 'a@x.com' }),
      ).rejects.toThrow('refused');
    });
  });

  describe('sendInstructorApplicationDeclinedEmail', () => {
    it('sends the decline notice with the re-apply hint', async () => {
      mocks.sendMail.mockResolvedValue({ accepted: ['x'] });
      const t = new SmtpEmailTransport(baseConfig);
      await t.sendInstructorApplicationDeclinedEmail({ to: 'a@x.com' });
      const arg = mocks.sendMail.mock.calls[0]![0];
      expect(arg.subject).toContain('instructor application');
      expect(arg.text).toContain('apply again');
    });

    it('rethrows after logging when the transport rejects', async () => {
      mocks.sendMail.mockRejectedValue(new Error('refused'));
      const t = new SmtpEmailTransport(baseConfig);
      await expect(
        t.sendInstructorApplicationDeclinedEmail({ to: 'a@x.com' }),
      ).rejects.toThrow('refused');
    });
  });

  describe('sendNewModuleEmail', () => {
    it('sends with the student name, module/course titles, and the course URL', async () => {
      mocks.sendMail.mockResolvedValue({ accepted: ['x'] });
      const t = new SmtpEmailTransport(baseConfig);
      await t.sendNewModuleEmail({
        to: 'a@x.com',
        studentName: 'Sam',
        moduleTitle: 'Module 7',
        courseTitle: 'Wren 101',
        courseUrl: 'https://learnwren.com/catalog/c1',
      });
      const arg = mocks.sendMail.mock.calls[0]![0];
      expect(arg.subject).toContain('Wren 101');
      expect(arg.text).toContain('Sam');
      expect(arg.text).toContain('Module 7');
      expect(arg.text).toContain('https://learnwren.com/catalog/c1');
    });

    it('rethrows after logging when the transport rejects', async () => {
      mocks.sendMail.mockRejectedValue(new Error('refused'));
      const t = new SmtpEmailTransport(baseConfig);
      await expect(
        t.sendNewModuleEmail({
          to: 'a@x.com',
          studentName: 's',
          moduleTitle: 'm',
          courseTitle: 'c',
          courseUrl: 'u',
        }),
      ).rejects.toThrow('refused');
    });
  });
});
