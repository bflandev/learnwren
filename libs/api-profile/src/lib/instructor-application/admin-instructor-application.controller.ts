import { Controller, Get, Param, Post, UseFilters, UseGuards } from '@nestjs/common';

import { FirebaseSessionGuard, AdminRoleGuard } from '@learnwren/api-auth';
import type {
  InstructorApplicationView,
  PendingInstructorApplicationsResponse,
  UserId,
} from '@learnwren/shared-data-models';

import { AdminInstructorApplicationExceptionFilter } from './admin-instructor-application.exception-filter';
import { AdminInstructorApplicationService } from './admin-instructor-application.service';

@Controller('admin/instructor-applications')
@UseFilters(AdminInstructorApplicationExceptionFilter)
@UseGuards(FirebaseSessionGuard, AdminRoleGuard)
export class AdminInstructorApplicationController {
  constructor(private readonly svc: AdminInstructorApplicationService) {}

  @Get()
  list(): Promise<PendingInstructorApplicationsResponse> {
    return this.svc.listPending();
  }

  @Post(':uid/approve')
  approve(@Param('uid') uid: string): Promise<InstructorApplicationView> {
    return this.svc.approve(uid as UserId);
  }

  @Post(':uid/decline')
  decline(@Param('uid') uid: string): Promise<InstructorApplicationView> {
    return this.svc.decline(uid as UserId);
  }
}
