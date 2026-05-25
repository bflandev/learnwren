import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';

import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { InstructorDirectory } from './catalog/instructor-directory';
import { CourseOwnerGuard } from './course-owner.guard';
import { EnrollmentController } from './enrollment/enrollment.controller';
import { EnrollmentRepository } from './enrollment/enrollment.repository';
import { EnrollmentService } from './enrollment/enrollment.service';
import { CoursesController } from './courses.controller';
import { CoursesExceptionFilter } from './courses.exception-filter';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { LearnController } from './learn/learn.controller';
import { LearnExceptionFilter } from './learn/learn.exception-filter';
import { LessonEnrollmentOrOwnerGuard } from './learn/guards/lesson-enrollment-or-owner.guard';
import { LearnService } from './learn/learn.service';
import { PublishService } from './publish/publish.service';
import { MaterialsModule } from './materials/materials.module';
import { VideoModule } from './video/video.module';

// VideoModule ↔ CoursesModule are mutually dependent (CoursesService cascades
// deletes into VideoService; VideoController injects CoursesRepository).
// MaterialsModule ↔ CoursesModule are mutually dependent (CoursesService cascades
// deletes into MaterialsService; MaterialsController injects CoursesRepository).
// NestJS resolves both cycles with forwardRef.
@Module({
  imports: [AuthModule, forwardRef(() => VideoModule), forwardRef(() => MaterialsModule)],
  controllers: [CoursesController, CatalogController, EnrollmentController, LearnController],
  providers: [
    CoursesService,
    CoursesRepository,
    CoursesExceptionFilter,
    CourseOwnerGuard,
    PublishService,
    CatalogService,
    InstructorDirectory,
    EnrollmentService,
    EnrollmentRepository,
    LearnService,
    LearnExceptionFilter,
    LessonEnrollmentOrOwnerGuard,
  ],
  exports: [CoursesRepository, CourseOwnerGuard, EnrollmentRepository],
})
export class CoursesModule {}
