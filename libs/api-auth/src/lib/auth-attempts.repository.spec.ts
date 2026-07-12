import { createHash } from 'node:crypto';

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FIRESTORE } from '@learnwren/api-firebase';

import { AuthAttemptsRepository } from './auth-attempts.repository';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

interface FakeFirestore {
  collection: ReturnType<typeof vi.fn>;
  runTransaction: ReturnType<typeof vi.fn>;
  _docs: Map<string, Record<string, unknown>>;
  _queryHits: Map<string, string>;  // unlockTokenHash → emailHash
}

function buildFakeFirestore(initial: Record<string, Record<string, unknown>> = {}): FakeFirestore {
  const docs = new Map<string, Record<string, unknown>>(Object.entries(initial));
  const queryHits = new Map<string, string>();
  for (const [hash, data] of docs) {
    if (data['unlockTokenHash']) queryHits.set(data['unlockTokenHash'] as string, hash);
  }

  const docRef = (hash: string) => ({
    get: vi.fn(async () => ({
      exists: docs.has(hash),
      data: () => docs.get(hash),
      ref: docRef(hash),
    })),
    set: vi.fn(async (data: Record<string, unknown>) => {
      docs.set(hash, { ...data });
      if (data['unlockTokenHash']) queryHits.set(data['unlockTokenHash'] as string, hash);
    }),
    delete: vi.fn(async () => {
      const existing = docs.get(hash);
      if (existing?.['unlockTokenHash']) queryHits.delete(existing['unlockTokenHash'] as string);
      docs.delete(hash);
    }),
    update: vi.fn(async (data: Record<string, unknown>) => {
      docs.set(hash, { ...docs.get(hash), ...data });
    }),
  });

  const collection = vi.fn(() => ({
    doc: vi.fn((hash: string) => docRef(hash)),
    where: vi.fn((field: string, _op: string, value: string) => ({
      limit: vi.fn(() => ({
        get: vi.fn(async () => {
          const hash = field === 'unlockTokenHash' ? queryHits.get(value) : undefined;
          if (!hash || !docs.has(hash)) return { empty: true, docs: [] };
          return {
            empty: false,
            docs: [
              {
                id: hash,
                exists: true,
                data: () => docs.get(hash),
                ref: docRef(hash),
              },
            ],
          };
        }),
      })),
    })),
  }));

  const runTransaction = vi.fn(async (cb: (t: unknown) => unknown) => {
    const t = {
      get: async (ref: ReturnType<typeof docRef>) => ref.get(),
      set: (ref: ReturnType<typeof docRef>, data: Record<string, unknown>) => ref.set(data),
      delete: (ref: ReturnType<typeof docRef>) => ref.delete(),
      update: (ref: ReturnType<typeof docRef>, data: Record<string, unknown>) =>
        ref.update(data),
    };
    return cb(t);
  });

  return { collection, runTransaction, _docs: docs, _queryHits: queryHits };
}

async function buildRepo(firestore: FakeFirestore) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthAttemptsRepository,
      { provide: FIRESTORE, useValue: firestore },
    ],
  }).compile();
  return moduleRef.get(AuthAttemptsRepository);
}

describe('AuthAttemptsRepository.emailHash', () => {
  it('produces lowercase, trimmed, sha256 hex', async () => {
    const repo = await buildRepo(buildFakeFirestore());
    expect(repo.emailHash('  Alice@Example.COM ')).toBe(
      // sha256('alice@example.com')
      'ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976',
    );
  });
});

describe('AuthAttemptsRepository.read', () => {
  beforeEach(() => vi.useRealTimers());

  it('returns null when doc does not exist', async () => {
    const repo = await buildRepo(buildFakeFirestore());
    expect(await repo.read('hash-1')).toBeNull();
  });

  it('returns doc as-is when not locked', async () => {
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 1, firstFailureAt: '2026-05-06T00:00:00.000Z' },
    });
    const repo = await buildRepo(fs);
    const doc = await repo.read('hash-1');
    expect(doc?.failedCount).toBe(1);
  });

  it('returns doc as-is when lockedUntil > now', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 3, lockedUntil: future, unlockTokenHash: sha256Hex('tok') },
    });
    const repo = await buildRepo(fs);
    const doc = await repo.read('hash-1');
    expect(doc?.lockedUntil).toBe(future);
  });

  it('lazily deletes the doc and returns null when lockedUntil <= now', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 3, lockedUntil: past, unlockTokenHash: sha256Hex('tok') },
    });
    const repo = await buildRepo(fs);
    expect(await repo.read('hash-1')).toBeNull();
    expect(fs._docs.has('hash-1')).toBe(false);
  });

  it('does NOT delete when a NEWER lock was written between the read and the lazy delete', async () => {
    // Concurrency race: the first read saw an expired lock, but a concurrent
    // recordFailure re-locked the account before the cleanup delete ran.
    // Deleting would erase the fresh lock — the in-transaction re-read must
    // see the changed lock state and leave the doc alone.
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    const del = vi.fn(async () => undefined);
    const get = vi
      .fn()
      // 1st read (outside the txn): expired lock.
      .mockResolvedValueOnce({ exists: true, data: () => ({ failedCount: 3, lockedUntil: past, unlockTokenHash: 'h' }) })
      // 2nd read (inside the txn): a newer, live lock.
      .mockResolvedValue({ exists: true, data: () => ({ failedCount: 3, lockedUntil: future, unlockTokenHash: 'h2' }) });
    const ref = { get, delete: del };
    const fakeFirestore = {
      collection: vi.fn(() => ({ doc: vi.fn(() => ref) })),
      runTransaction: vi.fn(async (cb: (t: unknown) => unknown) =>
        cb({
          get: async (r: typeof ref) => r.get(),
          delete: (r: typeof ref) => r.delete(),
        }),
      ),
      _docs: new Map(),
      _queryHits: new Map(),
    } as unknown as FakeFirestore;
    const repo = await buildRepo(fakeFirestore);

    // Per the snapshot this call read, the lock is expired → null is correct…
    expect(await repo.read('hash-1')).toBeNull();
    // …but the newer lock state must survive.
    expect(del).not.toHaveBeenCalled();
  });
});

describe('AuthAttemptsRepository.recordFailure', () => {
  it('creates a doc on first failure with count=1', async () => {
    const fs = buildFakeFirestore();
    const repo = await buildRepo(fs);
    const result = await repo.recordFailure('hash-1');
    expect(result.locked).toBe(false);
    expect(fs._docs.get('hash-1')?.['failedCount']).toBe(1);
    // Pins the collection name `auth_attempts` — a StringLiteral mutant
    // dropping it to '' would write to `firestore.collection('').doc(hash)`
    // and tests would still pass without this check.
    expect(fs.collection).toHaveBeenCalledWith('auth_attempts');
  });

  it('increments to 2 on second failure and preserves firstFailureAt', async () => {
    // Within the 15-minute failure window — the count must accumulate.
    const original = new Date(Date.now() - 60_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 1, firstFailureAt: original },
    });
    const repo = await buildRepo(fs);
    const result = await repo.recordFailure('hash-1');
    expect(result.locked).toBe(false);
    expect(fs._docs.get('hash-1')?.['failedCount']).toBe(2);
    // `data.firstFailureAt = data.firstFailureAt ?? nowIso` — the LogicalOperator
    // mutant (?? → &&) would overwrite the original timestamp with nowIso here.
    expect(fs._docs.get('hash-1')?.['firstFailureAt']).toBe(original);
  });

  it('locks on third failure with lockedUntil exactly LOCKOUT_MS in the future', async () => {
    // Pins LOCKOUT_MS = 15 * 60 * 1000 (15 minutes). ArithmeticOperator mutants
    // on the constant or on `now + LOCKOUT_MS` would shift the value.
    vi.useFakeTimers();
    const frozen = new Date('2026-05-06T12:00:00.000Z');
    vi.setSystemTime(frozen);
    try {
      const fs = buildFakeFirestore({
        // Within the 15-minute failure window relative to the frozen clock.
        'hash-1': { failedCount: 2, firstFailureAt: '2026-05-06T11:55:00.000Z' },
      });
      const repo = await buildRepo(fs);
      const result = await repo.recordFailure('hash-1');
      expect(result.locked).toBe(true);
      expect(result.unlockToken).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(result.lockedUntil).toBeInstanceOf(Date);
      expect(result.lockedUntil!.getTime()).toBe(frozen.getTime() + 15 * 60 * 1000);
      const doc = fs._docs.get('hash-1')!;
      expect(doc['failedCount']).toBe(3);
      // The stored value is the SHA-256 hash of the plaintext token returned
      // to the caller — the plaintext itself MUST NOT be persisted.
      expect(doc['unlockTokenHash']).toBe(sha256Hex(result.unlockToken!));
      expect(doc['unlockTokenHash']).not.toBe(result.unlockToken);
      expect(doc['unlockToken']).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats an auto-expired LOCKED doc as fresh on next failure', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 3, lockedUntil: past, unlockTokenHash: sha256Hex('old') },
    });
    const repo = await buildRepo(fs);
    const result = await repo.recordFailure('hash-1');
    expect(result.locked).toBe(false);
    expect(fs._docs.get('hash-1')?.['failedCount']).toBe(1);
    expect(fs._docs.get('hash-1')?.['lockedUntil']).toBeNull();
  });

  it('resets the count when firstFailureAt is older than the 15-minute window (2 stale failures + 1 fresh must NOT lock)', async () => {
    // Without a window, 2 failures today + 1 next year would lock the account.
    const stale = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 2, firstFailureAt: stale, lockedUntil: null },
    });
    const repo = await buildRepo(fs);
    const result = await repo.recordFailure('hash-1');
    expect(result.locked).toBe(false);
    const doc = fs._docs.get('hash-1')!;
    expect(doc['failedCount']).toBe(1);
    // A fresh streak starts now — firstFailureAt must be re-stamped.
    expect(doc['firstFailureAt']).not.toBe(stale);
  });

  it('still locks when firstFailureAt is exactly at the 15-minute boundary (window is >, not >=)', async () => {
    vi.useFakeTimers();
    const frozen = new Date('2026-05-06T12:00:00.000Z');
    vi.setSystemTime(frozen);
    try {
      const boundary = new Date(frozen.getTime() - 15 * 60 * 1000).toISOString();
      const fs = buildFakeFirestore({
        'hash-1': { failedCount: 2, firstFailureAt: boundary, lockedUntil: null },
      });
      const repo = await buildRepo(fs);
      const result = await repo.recordFailure('hash-1');
      expect(result.locked).toBe(true);
      expect(fs._docs.get('hash-1')?.['failedCount']).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AuthAttemptsRepository.clear', () => {
  it('deletes the doc', async () => {
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 2 },
    });
    const repo = await buildRepo(fs);
    await repo.clear('hash-1');
    expect(fs._docs.has('hash-1')).toBe(false);
  });

  it('is a no-op when the doc does not exist', async () => {
    const fs = buildFakeFirestore();
    const repo = await buildRepo(fs);
    await expect(repo.clear('hash-1')).resolves.not.toThrow();
  });
});

describe('AuthAttemptsRepository.redeemUnlockToken', () => {
  it('returns invalid when token does not match any doc', async () => {
    const fs = buildFakeFirestore();
    const repo = await buildRepo(fs);
    expect(await repo.redeemUnlockToken('nope')).toEqual({ status: 'invalid' });
  });

  it('queries `unlockTokenHash` with the sha256 of the input, not the raw token', async () => {
    // A StringLiteral mutant on the field name or operator would keep the
    // shape of the query but break semantics. Capture the where() args and
    // verify both the field name and that the *hash* (not plaintext) is sent.
    const whereSpy = vi.fn(() => ({
      limit: vi.fn(() => ({
        get: vi.fn(async () => ({ empty: true, docs: [] })),
      })),
    }));
    const fakeCollection = vi.fn(() => ({
      doc: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
      where: whereSpy,
    }));
    const fakeFirestore = {
      collection: fakeCollection,
      runTransaction: vi.fn(),
      _docs: new Map(),
      _queryHits: new Map(),
    } as unknown as FakeFirestore;
    const repo = await buildRepo(fakeFirestore);

    await repo.redeemUnlockToken('the-token');
    expect(whereSpy).toHaveBeenCalledWith(
      'unlockTokenHash',
      '==',
      sha256Hex('the-token'),
    );
  });

  it('returns ok and deletes the doc on a valid, non-expired token', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 3, lockedUntil: future, unlockTokenHash: sha256Hex('tok') },
    });
    const repo = await buildRepo(fs);
    expect(await repo.redeemUnlockToken('tok')).toEqual({ status: 'ok' });
    expect(fs._docs.has('hash-1')).toBe(false);
  });

  it('returns expired and deletes the doc on a token whose lock has elapsed', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 3, lockedUntil: past, unlockTokenHash: sha256Hex('tok') },
    });
    const repo = await buildRepo(fs);
    expect(await repo.redeemUnlockToken('tok')).toEqual({ status: 'expired' });
    expect(fs._docs.has('hash-1')).toBe(false);
  });

  it('honours the `query.empty` short-circuit even when a doc is present in the result', async () => {
    // Pins the `if (query.empty) return invalid` guard. A ConditionalExpression
    // mutant flipping it to `false` would skip the early return and fall through
    // to read docs[0]. Feed an *inconsistent* result — empty=true but a valid,
    // non-expired doc IS present — so the original returns `invalid` while the
    // mutant would read the doc and return `ok`. The valid doc must NOT be
    // deleted, proving the body never ran.
    const future = new Date(Date.now() + 60_000).toISOString();
    const del = vi.fn(async () => undefined);
    const docSnap = {
      id: 'hash-x',
      exists: true,
      data: () => ({ failedCount: 3, lockedUntil: future, unlockTokenHash: 'h' }),
      ref: { delete: del },
    };
    const fakeFirestore = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({ empty: true, docs: [docSnap] })),
          })),
        })),
      })),
      runTransaction: vi.fn(),
      _docs: new Map(),
      _queryHits: new Map(),
    } as unknown as FakeFirestore;
    const repo = await buildRepo(fakeFirestore);

    expect(await repo.redeemUnlockToken('tok')).toEqual({ status: 'invalid' });
    expect(del).not.toHaveBeenCalled();
  });

  it('returns invalid when the query reports non-empty but yields no doc', async () => {
    // Covers + pins the defensive `if (!docSnap) return invalid` guard. Feed an
    // inconsistent result — empty=false but docs=[] — so docs[0] is undefined.
    // The original returns `invalid`; a ConditionalExpression mutant flipping
    // `!docSnap` to `false`, or an ObjectLiteral/StringLiteral mutant on the
    // returned `{ status: 'invalid' }`, would read `undefined.data()` and throw
    // (or return the wrong shape) instead of cleanly reporting invalid.
    const fakeFirestore = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({ empty: false, docs: [] })),
          })),
        })),
      })),
      runTransaction: vi.fn(),
      _docs: new Map(),
      _queryHits: new Map(),
    } as unknown as FakeFirestore;
    const repo = await buildRepo(fakeFirestore);

    expect(await repo.redeemUnlockToken('tok')).toEqual({ status: 'invalid' });
  });

  it('does NOT delete a doc that was re-locked with a NEWER token between the query and the delete', async () => {
    // Concurrency race: the query matched the old token, but a concurrent
    // recordFailure re-locked the account with a new unlockTokenHash before we
    // deleted. Deleting would erase the newer lock state — the in-transaction
    // re-read must detect the mismatch and leave the doc alone.
    const future = new Date(Date.now() + 60_000).toISOString();
    const del = vi.fn(async () => undefined);
    const staleData = { failedCount: 3, lockedUntil: future, unlockTokenHash: sha256Hex('tok') };
    const newerData = { failedCount: 3, lockedUntil: future, unlockTokenHash: sha256Hex('NEWER') };
    const ref = {
      get: vi.fn(async () => ({ exists: true, data: () => newerData })),
      delete: del,
    };
    const fakeFirestore = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({
              empty: false,
              docs: [{ id: 'hash-1', exists: true, data: () => staleData, ref }],
            })),
          })),
        })),
      })),
      runTransaction: vi.fn(async (cb: (t: unknown) => unknown) =>
        cb({
          get: async (r: typeof ref) => r.get(),
          delete: (r: typeof ref) => r.delete(),
        }),
      ),
      _docs: new Map(),
      _queryHits: new Map(),
    } as unknown as FakeFirestore;
    const repo = await buildRepo(fakeFirestore);

    expect(await repo.redeemUnlockToken('tok')).toEqual({ status: 'invalid' });
    expect(del).not.toHaveBeenCalled();
  });

  it('returns invalid without deleting when the doc vanished between the query and the transaction', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const del = vi.fn(async () => undefined);
    const staleData = { failedCount: 3, lockedUntil: future, unlockTokenHash: sha256Hex('tok') };
    const ref = {
      get: vi.fn(async () => ({ exists: false, data: () => undefined })),
      delete: del,
    };
    const fakeFirestore = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({
              empty: false,
              docs: [{ id: 'hash-1', exists: true, data: () => staleData, ref }],
            })),
          })),
        })),
      })),
      runTransaction: vi.fn(async (cb: (t: unknown) => unknown) =>
        cb({
          get: async (r: typeof ref) => r.get(),
          delete: (r: typeof ref) => r.delete(),
        }),
      ),
      _docs: new Map(),
      _queryHits: new Map(),
    } as unknown as FakeFirestore;
    const repo = await buildRepo(fakeFirestore);

    expect(await repo.redeemUnlockToken('tok')).toEqual({ status: 'invalid' });
    expect(del).not.toHaveBeenCalled();
  });
});

describe('AuthAttemptsRepository throttle helpers', () => {
  it('recordResendVerification returns throttled=false when no prior timestamp', async () => {
    const fs = buildFakeFirestore();
    const repo = await buildRepo(fs);
    expect(await repo.recordResendVerification('hash-1')).toEqual({ throttled: false });
    expect(fs._docs.get('hash-1')?.['lastResendVerificationAt']).toBeTruthy();
  });

  it('recordResendVerification returns throttled=true within 60s window', async () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { lastResendVerificationAt: recent },
    });
    const repo = await buildRepo(fs);
    expect(await repo.recordResendVerification('hash-1')).toEqual({ throttled: true });
  });

  it('recordResendVerification returns throttled=false after 60s window', async () => {
    const old = new Date(Date.now() - 90_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { lastResendVerificationAt: old },
    });
    const repo = await buildRepo(fs);
    expect(await repo.recordResendVerification('hash-1')).toEqual({ throttled: false });
  });

  it('recordResendVerification is NOT throttled at the exact 60_000ms boundary', async () => {
    // The check is strict `<`. At exactly the boundary, throttled=false. A
    // mutant flipping `<` to `<=` would throttle at the boundary too.
    vi.useFakeTimers();
    const now = new Date('2026-05-06T12:00:00.000Z');
    vi.setSystemTime(now);
    try {
      const exactBoundary = new Date(now.getTime() - 60_000).toISOString();
      const fs = buildFakeFirestore({
        'hash-1': { lastResendVerificationAt: exactBoundary },
      });
      const repo = await buildRepo(fs);
      expect(await repo.recordResendVerification('hash-1')).toEqual({ throttled: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('recordPasswordResetRequest mirrors the same throttle behavior', async () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { lastPasswordResetAt: recent },
    });
    const repo = await buildRepo(fs);
    expect(await repo.recordPasswordResetRequest('hash-1')).toEqual({ throttled: true });
  });
});

describe('AuthAttemptsRepository.read — lock expiry boundary', () => {
  it('treats lockedUntil === Date.now() as expired (uses `<=` not `<`)', async () => {
    // The boundary check is `lockedUntil.getTime() <= Date.now()`. A mutant
    // flipping `<=` to `<` would treat the exact-equality case as still locked.
    vi.useFakeTimers();
    const now = new Date('2026-05-06T12:00:00.000Z');
    vi.setSystemTime(now);
    try {
      const fs = buildFakeFirestore({
        'hash-1': {
          failedCount: 3,
          lockedUntil: now.toISOString(),
          unlockTokenHash: sha256Hex('tok'),
        },
      });
      const repo = await buildRepo(fs);
      // Equal-to-now should be treated as expired → read returns null and the
      // doc is lazily deleted.
      expect(await repo.read('hash-1')).toBeNull();
      expect(fs._docs.has('hash-1')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats lockedUntil === null as not expired (preserves the doc)', async () => {
    // `if (!lockedUntil) return false;` — without that early return, a null
    // lockedUntil flows into `new Date(null).getTime()` (== 0) and would be
    // wrongly treated as expired.
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 1, firstFailureAt: '2026-05-06T00:00:00.000Z', lockedUntil: null },
    });
    const repo = await buildRepo(fs);
    const doc = await repo.read('hash-1');
    expect(doc).not.toBeNull();
    expect(fs._docs.has('hash-1')).toBe(true);
  });
});
