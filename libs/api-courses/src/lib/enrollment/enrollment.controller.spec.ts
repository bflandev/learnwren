import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type { CourseId, Enrollment, UserId } from '@learnwren/shared-data-models';

import { EnrollmentController } from './enrollment.controller';
import type { EnrollmentService } from './enrollment.service';

const UID = 'student-1' as UserId;
const CID = 'course-1' as CourseId;

function reqAs(uid: UserId): AuthenticatedRequest {
  return { user: { uid } } as AuthenticatedRequest;
}

describe('EnrollmentController', () => {
  let svc: {
    enroll: ReturnType<typeof vi.fn>;
    unenroll: ReturnType<typeof vi.fn>;
    getEnrollmentStatus: ReturnType<typeof vi.fn>;
  };
  let controller: EnrollmentController;

  beforeEach(() => {
    svc = {
      enroll: vi.fn().mockResolvedValue({ id: 'e1' } as Enrollment),
      unenroll: vi.fn().mockResolvedValue(undefined),
      getEnrollmentStatus: vi.fn().mockResolvedValue({ enrollment: null, isOwner: false }),
    };
    controller = new EnrollmentController(svc as unknown as EnrollmentService);
  });

  it('POST /enrollments enrolls the caller in the body-supplied course', async () => {
    await controller.enroll({ courseId: CID }, reqAs(UID));
    expect(svc.enroll).toHaveBeenCalledWith(UID, CID);
  });

  it('DELETE /enrollments/:courseId unenrolls the caller from the path course', async () => {
    await controller.unenroll(CID, reqAs(UID));
    expect(svc.unenroll).toHaveBeenCalledWith(UID, CID);
  });

  it('GET /enrollments/:courseId reports the caller status for that course', async () => {
    await controller.getStatus(CID, reqAs(UID));
    expect(svc.getEnrollmentStatus).toHaveBeenCalledWith(UID, CID);
  });
});
