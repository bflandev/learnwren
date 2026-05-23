import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';
import { FirebaseAdminModule } from '@learnwren/api-firebase';

import { CoursesModule } from '../courses.module';
import { MaterialAccessGuard } from './material-access.guard';
import { MaterialOwnerGuard } from './material-owner.guard';
import { MaterialsController } from './materials.controller';
import { MATERIALS_CONFIG, readMaterialsConfigFromEnv } from './materials.config';
import { MaterialsExceptionFilter } from './materials.exception-filter';
import { MaterialsRepository } from './materials.repository';
import { MaterialsService } from './materials.service';
import { MaterialsStorageAdapter } from './materials-storage.adapter';
import { FakeMaterialsController } from './webhook/fake-materials.controller';

// Gate the fake passthrough by the storage *implementation*, not by NODE_ENV.
// A staging/preview deploy with NODE_ENV unset but real GCS must not expose an
// unauthenticated endpoint that writes arbitrary bytes to material paths.
const fakeMaterialsEnabled =
  (process.env['LEARNWREN_MATERIALS_STORAGE_FAKE'] ?? '') === 'true';
const controllers = [
  MaterialsController,
  ...(fakeMaterialsEnabled ? [FakeMaterialsController] : []),
];

// CoursesModule ↔ MaterialsModule are mutually dependent (CoursesService
// cascades deletes into MaterialsService; MaterialsController injects
// CoursesRepository + CourseOwnerGuard). NestJS resolves the cycle with forwardRef.
@Module({
  imports: [FirebaseAdminModule, AuthModule, forwardRef(() => CoursesModule)],
  controllers,
  providers: [
    MaterialsRepository,
    MaterialsService,
    MaterialsStorageAdapter,
    MaterialOwnerGuard,
    MaterialAccessGuard,
    MaterialsExceptionFilter,
    { provide: MATERIALS_CONFIG, useFactory: () => readMaterialsConfigFromEnv(process.env) },
  ],
  exports: [MaterialsService],
})
export class MaterialsModule {}
