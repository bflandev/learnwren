import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AdminInstructorApplicationService } from './admin-instructor-application.service';
import {
  ApplicationNotFoundException,
  ApplicationNotPendingException,
  ApplicantNotVerifiedException,
} from './errors/admin-instructor-application.exception';

type DocStub = {
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function makeFirestore() {
  const docs: Record<string, DocStub> = {};
  const queryDocs: Array<{ data: () => unknown }> = [];
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
      where: vi.fn(() => ({ get: vi.fn(async () => ({ docs: queryDocs })) })),
    })),
    runTransaction: vi.fn(async (fn: (t: typeof txn) => Promise<unknown>) => fn(txn)),
  };
  return { firestore, docs, queryDocs, txn };
}

describe('AdminInstructorApplicationService', () => {
  let firestore: ReturnType<typeof makeFirestore>['firestore'];
  let docs: Record<string, DocStub>;
  let queryDocs: Array<{ data: () => unknown }>;
  let txn: ReturnType<typeof makeFirestore>['txn'];
  let auth: { getUser: ReturnType<typeof vi.fn>; setCustomUserClaims: ReturnType<typeof vi.fn> };
  let email: {
    sendInstructorApplicationApprovedEmail: ReturnType<typeof vi.fn>;
    sendInstructorApplicationDeclinedEmail: ReturnType<typeof vi.fn>;
  };
  let svc: AdminInstructorApplicationService;

  beforeEach(() => {
    ({ firestore, docs, queryDocs, txn } = makeFirestore());
    auth = {
      getUser: vi.fn(async () => ({ email: 'ada@example.com', emailVerified: true })),
      setCustomUserClaims: vi.fn(async () => undefined),
    };
    email = {
      sendInstructorApplicationApprovedEmail: vi.fn(async () => undefined),
      sendInstructorApplicationDeclinedEmail: vi.fn(async () => undefined),
    };
    svc = new AdminInstructorApplicationService(firestore as never, auth as never, email as never);
  });

  it('listPending joins each application with the user doc', async () => {
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

    const res = await svc.listPending();

    expect(res.applications).toEqual([
      {
        uid: 'u1',
        displayName: 'Ada',
        email: 'ada@example.com',
        statement: 's',
        expertise: 'e',
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

    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', { role: 'INSTRUCTOR' });
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
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
    expect(email.sendInstructorApplicationApprovedEmail).not.toHaveBeenCalled();
  });

  it('approve: unverified applicant -> ApplicantNotVerifiedException, no claim set', async () => {
    auth.getUser = vi.fn(async () => ({ email: 'ada@example.com', emailVerified: false }));
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ status: 'PENDING' }) })),
      update: vi.fn(),
    };
    await expect(svc.approve('u1' as never)).rejects.toThrow(ApplicantNotVerifiedException);
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  // If promoteUserToInstructor fails after the transaction committed APPROVED,
  // the service must revert the application status to PENDING so the admin can
  // retry, then rethrow the original error.
  it('approve: side-effect failure after transaction -> status reverted to PENDING and error propagates', async () => {
    const appUpdate = vi.fn(async () => undefined);
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({ uid: 'u1', statement: 's', expertise: 'e', status: 'PENDING', createdAt: 'c' }),
      })),
      update: appUpdate,
    };
    const promotionError = new Error('Firebase Auth unavailable');
    auth.setCustomUserClaims = vi.fn(async () => {
      throw promotionError;
    });

    await expect(svc.approve('u1' as never)).rejects.toThrow(promotionError);

    // The revert must write PENDING back so the admin can retry.
    expect(appUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING' }));
    // Email must NOT be sent (error happened before email step).
    expect(email.sendInstructorApplicationApprovedEmail).not.toHaveBeenCalled();
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

    const view = await svc.decline('u1' as never);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'DECLINED' }));
    expect(email.sendInstructorApplicationDeclinedEmail).toHaveBeenCalledWith({ to: 'ada@example.com' });
    expect(view.status).toBe('DECLINED');
  });

  it('decline: already resolved -> ApplicationNotPendingException', async () => {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ status: 'DECLINED' }) })),
      update: vi.fn(),
    };
    await expect(svc.decline('u1' as never)).rejects.toThrow(ApplicationNotPendingException);
  });

  // Simulates the losing request in a concurrent approve/decline or
  // decline/decline race.
  it('decline: concurrent loser sees non-PENDING status inside txn -> ApplicationNotPendingException, no email', async () => {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ status: 'APPROVED' }) })),
      update: vi.fn(async () => undefined),
    };

    await expect(svc.decline('u1' as never)).rejects.toThrow(ApplicationNotPendingException);
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

    const view = await svc.approve('u1' as never);

    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', { role: 'INSTRUCTOR' });
    expect(view.status).toBe('APPROVED');
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

    const view = await svc.decline('u1' as never);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'DECLINED' }));
    expect(view.status).toBe('DECLINED');
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

    const view = await svc.decline('u1' as never);

    expect(view.status).toBe('DECLINED');
    expect(email.sendInstructorApplicationDeclinedEmail).not.toHaveBeenCalled();
  });
});
