import { Controller, Get, Req, UseFilters, UseGuards } from '@nestjs/common';

import type { LessonView } from '@learnwren/shared-data-models';

import { FirebaseSessionGuard } from '@learnwren/api-auth';

import { LessonEnrollmentOrOwnerGuard } from './guards/lesson-enrollment-or-owner.guard';
import { LearnExceptionFilter } from './learn.exception-filter';
import { LearnService } from './learn.service';
import type { LessonScopedRequest } from './types/lesson-scoped-request';

@Controller('learn')
@UseFilters(LearnExceptionFilter)
@UseGuards(FirebaseSessionGuard, LessonEnrollmentOrOwnerGuard)
export class LearnController {
  constructor(private readonly service: LearnService) {}

  @Get('courses/:cid/lessons/:lid')
  async getLesson(@Req() req: LessonScopedRequest): Promise<LessonView> {
    if (!req.course || !req.lesson) {
      // Should be unreachable — the guard always attaches both on allow.
      throw new Error('LearnController: guard did not attach course/lesson');
    }
    return this.service.getLessonView(req.user!.uid, req.course, req.lesson);
  }
}
