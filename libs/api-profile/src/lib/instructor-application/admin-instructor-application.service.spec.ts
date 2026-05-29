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
  const firestore = {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => {
        const key = `${name}/${id}`;
        docs[key] ??= { get: vi.fn(), update: vi.fn(async () => undefined) };
        return docs[key];
      }),
      where: vi.fn(() => ({ get: vi.fn(async () => ({ docs: queryDocs })) })),
    })),
  };
  return { firestore, docs, queryDocs };
}

describe('AdminInstructorApplicationService', () => {
  let firestore: ReturnType<typeof makeFirestore>['firestore'];
  let docs: Record<string, DocStub>;
  let queryDocs: Array<{ data: () => unknown }>;
  let auth: { getUser: ReturnType<typeof vi.fn>; setCustomUserClaims: ReturnType<typeof vi.fn> };
  let email: {
    sendInstructorApplicationApprovedEmail: ReturnType<typeof vi.fn>;
    sendInstructorApplicationDeclinedEmail: ReturnType<typeof vi.fn>;
  };
  let svc: AdminInstructorApplicationService;

  beforeEach(() => {
    ({ firestore, docs, queryDocs } = makeFirestore());
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
    expect(email.sendInstructorApplicationApprovedEmail).toHaveBeenCalledWith({ to: 'ada@example.com' });
    expect(view.status).toBe('APPROVED');
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

  it('approve: unverified applicant -> ApplicantNotVerifiedException, no claim set', async () => {
    auth.getUser = vi.fn(async () => ({ email: 'ada@example.com', emailVerified: false }));
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ status: 'PENDING' }) })),
      update: vi.fn(),
    };
    await expect(svc.approve('u1' as never)).rejects.toThrow(ApplicantNotVerifiedException);
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
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
});
