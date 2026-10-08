import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { DELETE_FIELD } from '@learnwren/api-document-store';

import { AdminInstructorApplicationService } from './admin-instructor-application.service';
import {
  AdminInstructorApplicationException,
  ApplicationNotFoundException,
  ApplicationNotPendingException,
  ApplicantNotVerifiedException,
  DeclineReasonInvalidException,
  InvalidStatusFilterException,
} from './errors/admin-instructor-application.exception';

type DocStub = {
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function makeFirestore() {
  const docs: Record<string, DocStub> = {};
  const queryDocs: Array<{ data: () => unknown }> = [];
  const whereFn = vi.fn(() => ({ get: vi.fn(async () => ({ docs: queryDocs })) }));
  // Transaction object: delegates get/update to the underlying doc stubs so
  // the transaction path exercises the same in-memory registry as direct calls.
  const txn = {
    get: vi.fn(async (ref: DocStub) => ref.get()),
    update: vi.fn((ref: DocStub, data: Record<string, unknown>) => {
      void ref.update(data);
      return txn;
    }),
  };
  const firestore = {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => {
        const key = `${name}/${id}`;
        docs[key] ??= { get: vi.fn(), update: vi.fn(async () => undefined) };
        return docs[key];
      }),
      where: whereFn,
    })),
    runTransaction: vi.fn(async (fn: (t: typeof txn) => Promise<unknown>) => fn(txn)),
  };
  return { firestore, docs, queryDocs, txn, whereFn };
}

describe('AdminInstructorApplicationService', () => {
  let firestore: ReturnType<typeof makeFirestore>['firestore'];
  let docs: Record<string, DocStub>;
  let queryDocs: Array<{ data: () => unknown }>;
  let txn: ReturnType<typeof makeFirestore>['txn'];
  let whereFn: ReturnType<typeof makeFirestore>['whereFn'];
  let auth: { getUser: ReturnType<typeof vi.fn>; setRole: ReturnType<typeof vi.fn> };
  let email: {
    sendInstructorApplicationApprovedEmail: ReturnType<typeof vi.fn>;
    sendInstructorApplicationDeclinedEmail: ReturnType<typeof vi.fn>;
  };
  let svc: AdminInstructorApplicationService;

  beforeEach(() => {
    ({ firestore, docs, queryDocs, txn, whereFn } = makeFirestore());
    auth = {
      getUser: vi.fn(async () => ({ email: 'ada@example.com', emailVerified: true })),
      setRole: vi.fn(async () => undefined),
    };
    email = {
      sendInstructorApplicationApprovedEmail: vi.fn(async () => undefined),
      sendInstructorApplicationDeclinedEmail: vi.fn(async () => undefined),
    };
    svc = new AdminInstructorApplicationService(firestore as never, auth as never, email as never);
  });

  it('list joins each application with the user doc', async () => {
    queryDocs.push({
      data: () => ({
        uid: 'u1',
        statement: 's',
        expertise: 'e',
        status: 'PENDING',
        createdAt: '2026-05-29T00:00:00.000Z',
      }),
    });
    docs['users/u1'] = {
      get: vi.fn(async () => ({ data: () => ({ displayName: 'Ada', email: 'ada@example.com' }) })),
      update: vi.fn(),
    };

    const res = await svc.list(undefined);

    // Pins the Firestore query filter: field 'status', operator '==', value 'PENDING'.
    expect(whereFn).toHaveBeenCalledWith('status', '==', 'PENDING');
    expect(res.applications).toEqual([
      {
        uid: 'u1',
        displayName: 'Ada',
        email: 'ada@example.com',
        statement: 's',
        expertise: 'e',
        status: 'PENDING',
        createdAt: '2026-05-29T00:00:00.000Z',
      },
    ]);
  });

  it('list orders PENDING rows oldest first', async () => {
    for (const [uid, createdAt] of [['b', '2026-05-02T00:00:00.000Z'], ['a', '2026-05-01T00:00:00.000Z']]) {
      queryDocs.push({ data: () => ({ uid, statement: 's', expertise: 'e', status: 'PENDING', createdAt }) });
      docs[`users/${uid}`] = { get: vi.fn(async () => ({ data: () => undefined })), update: vi.fn() };
    }

    const res = await svc.list('PENDING');

    expect(res.applications.map((a) => a.uid)).toEqual(['a', 'b']);
  });

  it('list(DECLINED) queries that status, returns resolvedAt + declineReason, newest decision first', async () => {
    const rows = [
      { uid: 'old', resolvedAt: '2026-06-01T00:00:00.000Z', declineReason: 'Too thin' },
      { uid: 'new', resolvedAt: '2026-06-03T00:00:00.000Z' },
    ];
    for (const r of rows) {
      queryDocs.push({
        data: () => ({ statement: 's', expertise: 'e', status: 'DECLINED', createdAt: 'c', ...r }),
      });
      docs[`users/${r.uid}`] = { get: vi.fn(async () => ({ data: () => undefined })), update: vi.fn() };
    }

    const res = await svc.list('DECLINED');

    expect(whereFn).toHaveBeenCalledWith('status', '==', 'DECLINED');
    expect(res.applications).toEqual([
      {
        uid: 'new', displayName: '', email: '', statement: 's', expertise: 'e',
        status: 'DECLINED', createdAt: 'c', resolvedAt: '2026-06-03T00:00:00.000Z',
      },
      {
        uid: 'old', displayName: '', email: '', statement: 's', expertise: 'e',
        status: 'DECLINED', createdAt: 'c', resolvedAt: '2026-06-01T00:00:00.000Z',
        declineReason: 'Too thin',
      },
    ]);
    // Absent optional fields are omitted, not rendered as undefined keys.
    expect(Object.keys(res.applications[0] ?? {})).not.toContain('declineReason');
  });

  it('list sorts a resolved row with no resolvedAt (legacy data) after dated rows', async () => {
    for (const r of [
      { uid: 'undated' },
      { uid: 'mid', resolvedAt: '2026-06-02T00:00:00.000Z' },
      { uid: 'undated2' },
      { uid: 'late', resolvedAt: '2026-06-09T00:00:00.000Z' },
    ]) {
      queryDocs.push({ data: () => ({ statement: 's', expertise: 'e', status: 'APPROVED', createdAt: 'c', ...r }) });
      docs[`users/${r.uid}`] = { get: vi.fn(async () => ({ data: () => undefined })), update: vi.fn() };
    }

    const res = await svc.list('APPROVED');

    expect(res.applications.map((a) => a.uid).slice(0, 2)).toEqual(['late', 'mid']);
  });

  it('list(APPROVED) queries the APPROVED status', async () => {
    await svc.list('APPROVED');
    expect(whereFn).toHaveBeenCalledWith('status', '==', 'APPROVED');
  });

  it('list rejects an unknown status filter before querying', async () => {
    await expect(svc.list('NONE')).rejects.toThrow(InvalidStatusFilterException);
    expect(whereFn).not.toHaveBeenCalled();
  });

  it('list falls back to empty displayName/email when the user doc is missing', async () => {
    queryDocs.push({
      data: () => ({
        uid: 'u-missing',
        statement: 's',
        expertise: 'e',
        status: 'PENDING',
        createdAt: '2026-05-29T00:00:00.000Z',
      }),
    });
    // No docs['users/u-missing'] registered -> readStoredUserProfiles returns no
    // entry -> profiles.get(uid) is undefined -> optional-chaining + '' fallback.
    docs['users/u-missing'] = {
      get: vi.fn(async () => ({ data: () => undefined })),
      update: vi.fn(),
    };

    const res = await svc.list(undefined);

    expect(res.applications).toEqual([
      {
        uid: 'u-missing',
        displayName: '',
        email: '',
        statement: 's',
        expertise: 'e',
        status: 'PENDING',
        createdAt: '2026-05-29T00:00:00.000Z',
      },
    ]);
  });

  it('approve: verified pending -> claim + role + email + APPROVED view', async () => {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({ uid: 'u1', statement: 's', expertise: 'e', status: 'PENDING', createdAt: 'c' }),
      })),
      update: vi.fn(async () => undefined),
    };

    const view = await svc.approve('u1' as never);

    expect(auth.setRole).toHaveBeenCalledWith('u1', 'INSTRUCTOR');
    expect(docs['users/u1'].update).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'INSTRUCTOR' }),
    );
    expect(email.sendInstructorApplicationApprovedEmail).toHaveBeenCalledWith({ to: 'ada@example.com' });
    expect(view.status).toBe('APPROVED');
  });

  it('approve: verified pending -> status claimed APPROVED inside the transaction', async () => {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({ uid: 'u1', statement: 's', expertise: 'e', status: 'PENDING', createdAt: 'c' }),
      })),
      update: vi.fn(async () => undefined),
    };

    await svc.approve('u1' as never);

    // The transaction must write the status claim before any side effects run.
    expect(txn.update).toHaveBeenCalledWith(
      docs['instructorApplications/u1'],
      expect.objectContaining({ status: 'APPROVED' }),
    );
  });

  it('approve: missing app -> ApplicationNotFoundException', async () => {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({ exists: false, data: () => undefined })),
      update: vi.fn(),
    };
    await expect(svc.approve('u1' as never)).rejects.toThrow(ApplicationNotFoundException);
  });

  it('approve: already resolved -> ApplicationNotPendingException', async () => {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ status: 'APPROVED' }) })),
      update: vi.fn(),
    };
    await expect(svc.approve('u1' as never)).rejects.toThrow(ApplicationNotPendingException);
  });

  // Simulates the losing request in a concurrent approve/approve race:
  // the first request committed APPROVED; the second's transaction re-reads
  // and finds a non-PENDING status → typed error, no promotion, no email.
  it('approve: concurrent loser sees APPROVED status inside txn -> ApplicationNotPendingException, no promotion', async () => {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ status: 'APPROVED' }) })),
      update: vi.fn(async () => undefined),
    };

    await expect(svc.approve('u1' as never)).rejects.toThrow(ApplicationNotPendingException);
    expect(auth.setRole).not.toHaveBeenCalled();
    expect(email.sendInstructorApplicationApprovedEmail).not.toHaveBeenCalled();
  });

  it('approve: missing Auth user (getUser resolves null) -> typed ApplicationNotFoundException, not a raw 500', async () => {
    // getUser runs before the transaction; a null result (the port's contract
    // for an unknown user) used to be a thrown auth/user-not-found that could
    // escape the feature filter's @Catch list and render unenveloped.
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({ uid: 'u1', statement: 's', expertise: 'e', status: 'PENDING', createdAt: 'c' }),
      })),
      update: vi.fn(async () => undefined),
    };
    auth.getUser = vi.fn(async () => null);

    await expect(svc.approve('u1' as never)).rejects.toThrow(ApplicationNotFoundException);
    // Nothing was claimed or promoted.
    expect(txn.update).not.toHaveBeenCalled();
    expect(auth.setRole).not.toHaveBeenCalled();
  });

  it('approve: other raw getUser failure -> typed INTERNAL AdminInstructorApplicationException with cause', async () => {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({ uid: 'u1', statement: 's', expertise: 'e', status: 'PENDING', createdAt: 'c' }),
      })),
      update: vi.fn(async () => undefined),
    };
    const cause = Object.assign(new Error('backend down'), { code: 'auth/internal-error' });
    auth.getUser = vi.fn(async () => {
      throw cause;
    });

    const err = await svc.approve('u1' as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminInstructorApplicationException);
    expect((err as AdminInstructorApplicationException).code).toBe('INTERNAL');
    expect((err as AdminInstructorApplicationException).status).toBe(500);
    expect((err as Error).message).toBe('Failed to load the applicant.');
    expect((err as Error).cause).toBe(cause);
    expect(txn.update).not.toHaveBeenCalled();
  });

  it('approve: unverified applicant -> ApplicantNotVerifiedException, no claim set', async () => {
    auth.getUser = vi.fn(async () => ({ email: 'ada@example.com', emailVerified: false }));
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ status: 'PENDING' }) })),
      update: vi.fn(),
    };
    await expect(svc.approve('u1' as never)).rejects.toThrow(ApplicantNotVerifiedException);
    expect(auth.setRole).not.toHaveBeenCalled();
  });

  // If promoteUserToInstructor fails after the transaction committed APPROVED,
  // the service must revert the application to a clean PENDING state (no stale
  // resolvedAt) and surface a typed INTERNAL error the feature filter renders
  // with the {error:{code}} envelope (a raw SDK error would escape @Catch).
  it('approve: side-effect failure after transaction -> clean PENDING revert and typed INTERNAL error', async () => {
    const appUpdate = vi.fn(async () => undefined);
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({ uid: 'u1', statement: 's', expertise: 'e', status: 'PENDING', createdAt: 'c' }),
      })),
      update: appUpdate,
    };
    const promotionError = new Error('Firebase Auth unavailable');
    auth.setRole = vi.fn(async () => {
      throw promotionError;
    });

    const err: unknown = await svc.approve('u1' as never).then(
      () => {
        throw new Error('expected approve to reject');
      },
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(AdminInstructorApplicationException);
    expect((err as AdminInstructorApplicationException).code).toBe('INTERNAL');
    expect((err as AdminInstructorApplicationException).status).toBe(500);
    expect((err as Error).message).toBe('An internal error occurred during promotion.');
    expect((err as Error).cause).toBe(promotionError);

    // The revert must restore a clean PENDING doc: status written back AND the
    // resolvedAt stamp removed (not left as a stale resolution timestamp).
    expect(appUpdate).toHaveBeenCalledWith({ status: 'PENDING', resolvedAt: DELETE_FIELD });
    // Email must NOT be sent (error happened before email step).
    expect(email.sendInstructorApplicationApprovedEmail).not.toHaveBeenCalled();
  });

  // If the revert update ALSO fails, the .catch callback must log and swallow
  // (the original typed INTERNAL error still surfaces, not the revert error).
  it('approve: revert failure after promotion failure is logged and swallowed', async () => {
    const revertError = new Error('firestore unavailable');
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({ uid: 'u1', statement: 's', expertise: 'e', status: 'PENDING', createdAt: 'c' }),
      })),
      update: vi.fn(async () => {
        throw revertError;
      }),
    };
    auth.setRole = vi.fn(async () => {
      throw new Error('Firebase Auth unavailable');
    });
    const errSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const err: unknown = await svc.approve('u1' as never).then(
      () => {
        throw new Error('expected approve to reject');
      },
      (e: unknown) => e,
    );

    // The original typed INTERNAL error surfaces (revert error swallowed).
    expect(err).toBeInstanceOf(AdminInstructorApplicationException);
    expect((err as AdminInstructorApplicationException).code).toBe('INTERNAL');
    // The .catch callback must have logged the revert failure.
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('approval revert failed'));
    errSpy.mockRestore();
  });

  it('decline: pending -> DECLINED view + email', async () => {
    const update = vi.fn(async () => undefined);
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({ uid: 'u1', statement: 's', expertise: 'e', status: 'PENDING', createdAt: 'c' }),
      })),
      update,
    };

    const view = await svc.decline('u1' as never, {});

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'DECLINED' }));
    expect(email.sendInstructorApplicationDeclinedEmail).toHaveBeenCalledWith({ to: 'ada@example.com' });
    expect(view.status).toBe('DECLINED');
  });

  function pendingApp(update = vi.fn(async () => undefined)) {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({ uid: 'u1', statement: 's', expertise: 'e', status: 'PENDING', createdAt: 'c' }),
      })),
      update,
    };
    return update;
  }

  it('decline with a reason stores it trimmed, emails it, and returns it', async () => {
    const update = pendingApp();

    const view = await svc.decline('u1' as never, { reason: '  Needs more detail  ' });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DECLINED', declineReason: 'Needs more detail' }),
    );
    expect(email.sendInstructorApplicationDeclinedEmail).toHaveBeenCalledWith({
      to: 'ada@example.com',
      reason: 'Needs more detail',
    });
    expect(view.declineReason).toBe('Needs more detail');
  });

  it('decline with a blank reason stores no reason field', async () => {
    const update = pendingApp();

    const view = await svc.decline('u1' as never, { reason: '   ' });

    expect(Object.keys((update.mock.calls[0] as unknown[])[0] as object)).not.toContain('declineReason');
    expect(email.sendInstructorApplicationDeclinedEmail).toHaveBeenCalledWith({ to: 'ada@example.com' });
    expect(view).not.toHaveProperty('declineReason');
  });

  it('decline treats a null reason as no reason', async () => {
    const update = pendingApp();
    await svc.decline('u1' as never, { reason: null as never });
    expect(Object.keys((update.mock.calls[0] as unknown[])[0] as object)).not.toContain('declineReason');
  });

  it('decline accepts a reason of exactly the maximum length', async () => {
    pendingApp();
    const view = await svc.decline('u1' as never, { reason: 'x'.repeat(2000) });
    expect(view.declineReason).toHaveLength(2000);
  });

  it('decline rejects an over-long reason before claiming the application', async () => {
    pendingApp();
    await expect(svc.decline('u1' as never, { reason: 'x'.repeat(2001) })).rejects.toThrow(
      DeclineReasonInvalidException,
    );
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });

  it('decline rejects a non-string reason', async () => {
    pendingApp();
    await expect(svc.decline('u1' as never, { reason: 42 as never })).rejects.toThrow(
      DeclineReasonInvalidException,
    );
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });

  it('decline: missing app -> ApplicationNotFoundException', async () => {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({ exists: false, data: () => undefined })),
      update: vi.fn(),
    };
    await expect(svc.decline('u1' as never, {})).rejects.toThrow(ApplicationNotFoundException);
    expect(email.sendInstructorApplicationDeclinedEmail).not.toHaveBeenCalled();
  });

  it('decline: already resolved -> ApplicationNotPendingException', async () => {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ status: 'DECLINED' }) })),
      update: vi.fn(),
    };
    await expect(svc.decline('u1' as never, {})).rejects.toThrow(ApplicationNotPendingException);
  });

  // Simulates the losing request in a concurrent approve/decline or
  // decline/decline race.
  it('decline: concurrent loser sees non-PENDING status inside txn -> ApplicationNotPendingException, no email', async () => {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ status: 'APPROVED' }) })),
      update: vi.fn(async () => undefined),
    };

    await expect(svc.decline('u1' as never, {})).rejects.toThrow(ApplicationNotPendingException);
    expect(email.sendInstructorApplicationDeclinedEmail).not.toHaveBeenCalled();
  });

  it('approve: email failure does not fail the operation', async () => {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({ uid: 'u1', statement: 's', expertise: 'e', status: 'PENDING', createdAt: 'c' }),
      })),
      update: vi.fn(async () => undefined),
    };
    email.sendInstructorApplicationApprovedEmail = vi.fn(async () => {
      throw new Error('smtp down');
    });
    // Spy the logger so the (otherwise no-op) catch BODY is asserted: emptying it
    // must fail this test.
    const errSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const view = await svc.approve('u1' as never);

    expect(auth.setRole).toHaveBeenCalledWith('u1', 'INSTRUCTOR');
    expect(view.status).toBe('APPROVED');
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('approval notice failed'));
    errSpy.mockRestore();
  });

  it('decline: email failure does not fail the operation', async () => {
    const update = vi.fn(async () => undefined);
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({ uid: 'u1', statement: 's', expertise: 'e', status: 'PENDING', createdAt: 'c' }),
      })),
      update,
    };
    email.sendInstructorApplicationDeclinedEmail = vi.fn(async () => {
      throw new Error('smtp down');
    });
    // Spy the logger so the (otherwise no-op) catch BODY is asserted.
    const errSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const view = await svc.decline('u1' as never, {});

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'DECLINED' }));
    expect(view.status).toBe('DECLINED');
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('decline notice failed'));
    errSpy.mockRestore();
  });

  // The claim (PENDING→DECLINED) is committed before getUser is called.  If
  // getUser throws (e.g. the user was deleted between submission and review),
  // the decline must still resolve — the comment already says "a notification
  // failure must not fail the request".  No email attempt should be made when
  // the user record cannot be fetched.
  it('decline: getUser failure after the claim does not propagate', async () => {
    const update = vi.fn(async () => undefined);
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({ uid: 'u1', statement: 's', expertise: 'e', status: 'PENDING', createdAt: 'c' }),
      })),
      update,
    };
    const getUserError = new Error('auth/user-not-found');
    auth.getUser = vi.fn(async () => {
      throw getUserError;
    });

    const view = await svc.decline('u1' as never, {});

    expect(view.status).toBe('DECLINED');
    expect(email.sendInstructorApplicationDeclinedEmail).not.toHaveBeenCalled();
  });

  // Same best-effort skip, but via the port's null-for-unknown-user contract
  // rather than a thrown error.
  it('decline: getUser resolving null after the claim does not propagate', async () => {
    const update = vi.fn(async () => undefined);
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({ uid: 'u1', statement: 's', expertise: 'e', status: 'PENDING', createdAt: 'c' }),
      })),
      update,
    };
    auth.getUser = vi.fn(async () => null);
    // Spy the logger: `email.sendInstructorApplicationDeclinedEmail` not being
    // called is also true if `if (!user) throw …` were skipped and `user.email`
    // threw a TypeError instead (caught by the same outer try/catch) — that
    // wouldn't distinguish a ConditionalExpression mutant on the guard. Pin the
    // exact thrown message instead: a TypeError's text would read
    // "Cannot read properties of null", not "user not found".
    const errSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const view = await svc.decline('u1' as never, {});

    expect(view.status).toBe('DECLINED');
    expect(email.sendInstructorApplicationDeclinedEmail).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('user not found'));
    errSpy.mockRestore();
  });
});
