import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';

import { CourseOwnerGuard } from './course-owner.guard';
import { CoursesController } from './courses.controller';
import { CoursesExceptionFilter } from './courses.exception-filter';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { PublishService } from './publish/publish.service';
import { VideoModule } from './video/video.module';

// VideoModule ↔ CoursesModule are mutually dependent (CoursesService cascades
// deletes into VideoService; VideoController injects CoursesRepository).
// NestJS resolves the cycle with forwardRef.
@Module({
  imports: [AuthModule, forwardRef(() => VideoModule)],
  controllers: [CoursesController],
  providers: [
    CoursesService,
    CoursesRepository,
    CoursesExceptionFilter,
    CourseOwnerGuard,
    PublishService,
  ],
  exports: [CoursesRepository, CourseOwnerGuard],
})
export class CoursesModule {}
