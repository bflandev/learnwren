import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type {
  CourseId,
  Enrollment,
  EnrollmentStatusView,
} from '@learnwren/shared-data-models';

import { CoursesExceptionFilter } from '../courses.exception-filter';
import { EnrollCourseDto } from './dto/enroll-course.dto';
import { EnrollmentService } from './enrollment.service';

/**
 * Authenticated enrollment surface. The caller's uid always comes from the
 * session — never from the body or path — so a caller can only ever act on
 * their own enrollment.
 */
@Controller('enrollments')
@UseFilters(CoursesExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class EnrollmentController {
  constructor(private readonly svc: EnrollmentService) {}

  @Post()
  enroll(
    @Body() body: EnrollCourseDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<Enrollment> {
    return this.svc.enroll(req.user!.uid, body.courseId);
  }

  @Delete(':courseId')
  @HttpCode(204)
  async unenroll(
    @Param('courseId') courseId: CourseId,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.svc.unenroll(req.user!.uid, courseId);
  }

  @Get(':courseId')
  getStatus(
    @Param('courseId') courseId: CourseId,
    @Req() req: AuthenticatedRequest,
  ): Promise<EnrollmentStatusView> {
    return this.svc.getEnrollmentStatus(req.user!.uid, courseId);
  }
}
