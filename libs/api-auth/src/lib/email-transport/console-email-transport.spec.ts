import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsoleEmailTransport } from './console-email-transport';

describe('ConsoleEmailTransport.sendUnlockEmail', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs the recipient, URL, and unlock time', async () => {
    const transport = new ConsoleEmailTransport();
    await transport.sendUnlockEmail({
      to: 'alice@example.com',
      unlockUrl: 'https://learnwren.com/auth/unlock?token=abc',
      unlockAvailableAt: new Date('2026-05-06T01:00:00.000Z'),
    });
    expect(logSpy).toHaveBeenCalled();
    const logged = String(logSpy.mock.calls[0]?.[0]);
    expect(logged).toContain('alice@example.com');
    expect(logged).toContain('https://learnwren.com/auth/unlock?token=abc');
    expect(logged).toContain('2026-05-06T01:00:00.000Z');
  });
});

describe('ConsoleEmailTransport.sendVerificationEmail', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs the recipient and verification URL', async () => {
    const transport = new ConsoleEmailTransport();
    await transport.sendVerificationEmail({
      to: 'alice@example.com',
      verificationUrl: 'https://learnwren.com/auth/verify?oobCode=xyz',
    });
    expect(logSpy).toHaveBeenCalled();
    const logged = String(logSpy.mock.calls[0]?.[0]);
    expect(logged).toContain('alice@example.com');
    expect(logged).toContain('https://learnwren.com/auth/verify?oobCode=xyz');
  });
});

describe('ConsoleEmailTransport.sendPasswordResetEmail', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs the recipient and password-reset URL', async () => {
    const transport = new ConsoleEmailTransport();
    await transport.sendPasswordResetEmail({
      to: 'bob@example.com',
      resetUrl: 'https://learnwren.com/auth/reset?oobCode=abc',
    });
    expect(logSpy).toHaveBeenCalled();
    const logged = String(logSpy.mock.calls[0]?.[0]);
    expect(logged).toContain('bob@example.com');
    expect(logged).toContain('https://learnwren.com/auth/reset?oobCode=abc');
  });
});

describe('ConsoleEmailTransport.lastSentTo (outbox)', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the most recent matching email by kind+recipient', async () => {
    const t = new ConsoleEmailTransport();
    await t.sendUnlockEmail({
      to: 'a@x.com',
      unlockUrl: 'u1',
      unlockAvailableAt: new Date('2026-05-01T00:00:00Z'),
    });
    await t.sendUnlockEmail({
      to: 'a@x.com',
      unlockUrl: 'u2',
      unlockAvailableAt: new Date('2026-05-02T00:00:00Z'),
    });
    await t.sendUnlockEmail({
      to: 'b@x.com',
      unlockUrl: 'u3',
      unlockAvailableAt: new Date('2026-05-03T00:00:00Z'),
    });
    expect(t.lastSentTo('a@x.com', 'unlock')?.url).toBe('u2');
    expect(t.lastSentTo('b@x.com', 'unlock')?.url).toBe('u3');
  });

  it('returns undefined when no matching email has been sent', () => {
    const t = new ConsoleEmailTransport();
    expect(t.lastSentTo('nobody@x.com', 'unlock')).toBeUndefined();
  });

  it('distinguishes verification, password-reset, and unlock kinds for the same recipient', async () => {
    const t = new ConsoleEmailTransport();
    await t.sendVerificationEmail({ to: 'a@x.com', verificationUrl: 'verify' });
    await t.sendPasswordResetEmail({ to: 'a@x.com', resetUrl: 'reset' });
    await t.sendUnlockEmail({
      to: 'a@x.com',
      unlockUrl: 'unlock',
      unlockAvailableAt: new Date(),
    });
    expect(t.lastSentTo('a@x.com', 'verification')?.url).toBe('verify');
    expect(t.lastSentTo('a@x.com', 'password-reset')?.url).toBe('reset');
    expect(t.lastSentTo('a@x.com', 'unlock')?.url).toBe('unlock');
  });

  it('caps the outbox at 100 entries (oldest entry is evicted)', async () => {
    const t = new ConsoleEmailTransport();
    // Push 101 entries; the first should be evicted.
    for (let i = 0; i < 101; i++) {
      await t.sendVerificationEmail({
        to: `user${i}@x.com`,
        verificationUrl: `v${i}`,
      });
    }
    // user0 should have been pushed off the front of the queue
    expect(t.lastSentTo('user0@x.com', 'verification')).toBeUndefined();
    // user100 (the latest) should still be present
    expect(t.lastSentTo('user100@x.com', 'verification')?.url).toBe('v100');
  });
});
