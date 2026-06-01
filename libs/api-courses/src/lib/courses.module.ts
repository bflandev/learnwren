import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';

import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { InstructorDirectory } from './catalog/instructor-directory';
import { CourseOwnerGuard } from './course-owner.guard';
import { COVER_CONFIG, readCoverConfigFromEnv, type CoverConfig } from './cover/cover.config';
import {
  COVER_STORAGE,
  FirebaseCoverStorageAdapter,
} from './cover/cover-storage.adapter';
import { FakeCoverStorageAdapter } from './cover/fake-cover-storage.adapter';
import { CoverController } from './cover/cover.controller';
import { CoverExceptionFilter } from './cover/cover.exception-filter';
import { CoverImageService } from './cover/cover-image.service';
import { EnrollmentController } from './enrollment/enrollment.controller';
import { EnrollmentRepository } from './enrollment/enrollment.repository';
import { EnrollmentService } from './enrollment/enrollment.service';
import { CoursesController } from './courses.controller';
import { CoursesExceptionFilter } from './courses.exception-filter';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { LearnController } from './learn/learn.controller';
import { LearnExceptionFilter } from './learn/learn.exception-filter';
import { LessonEnrollmentGuard } from './learn/guards/lesson-enrollment.guard';
import { LessonEnrollmentOrOwnerGuard } from './learn/guards/lesson-enrollment-or-owner.guard';
import { LearnService } from './learn/learn.service';
import { PublishService } from './publish/publish.service';
import { AnalyticsController } from './analytics/analytics.controller';
import { AnalyticsService } from './analytics/analytics.service';
import { RosterController } from './roster/roster.controller';
import { RosterService } from './roster/roster.service';
import { MaterialsModule } from './materials/materials.module';
import { VideoModule } from './video/video.module';

// VideoModule ↔ CoursesModule are mutually dependent (CoursesService cascades
// deletes into VideoService; VideoController injects CoursesRepository).
// MaterialsModule ↔ CoursesModule are mutually dependent (CoursesService cascades
// deletes into MaterialsService; MaterialsController injects CoursesRepository).
// NestJS resolves both cycles with forwardRef.
@Module({
  imports: [AuthModule, forwardRef(() => VideoModule), forwardRef(() => MaterialsModule)],
  controllers: [CoursesController, CatalogController, EnrollmentController, LearnController, CoverController, RosterController, AnalyticsController],
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
    LessonEnrollmentGuard,
    RosterService,
    AnalyticsService,
    CoverImageService,
    CoverExceptionFilter,
    FirebaseCoverStorageAdapter,
    { provide: COVER_CONFIG, useFactory: () => readCoverConfigFromEnv(process.env) },
    {
      provide: COVER_STORAGE,
      inject: [COVER_CONFIG, FirebaseCoverStorageAdapter],
      useFactory: (cfg: CoverConfig, firebase: FirebaseCoverStorageAdapter) =>
        cfg.impl === 'firebase' ? firebase : new FakeCoverStorageAdapter({ bucket: cfg.bucket }),
    },
  ],
  exports: [CoursesRepository, CourseOwnerGuard, EnrollmentRepository],
})
export class CoursesModule {}
