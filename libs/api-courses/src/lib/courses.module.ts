import { Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';

import { CourseOwnerGuard } from './course-owner.guard';
import { CoursesController } from './courses.controller';
import { CoursesExceptionFilter } from './courses.exception-filter';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { InstructorRoleGuard } from './instructor-role.guard';

@Module({
  imports: [AuthModule],
  controllers: [CoursesController],
  providers: [
    CoursesService,
    CoursesRepository,
    CoursesExceptionFilter,
    InstructorRoleGuard,
    CourseOwnerGuard,
  ],
})
export class CoursesModule {}
