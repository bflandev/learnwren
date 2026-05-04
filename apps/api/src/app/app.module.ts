import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { FirebaseAdminModule } from '@learnwren/api-firebase';
import { AuthModule } from '@learnwren/api-auth';

import { AppController } from './app.controller';
import { FirestoreSmokeController } from './firestore-smoke/firestore-smoke.controller';

@Module({
  imports: [FirebaseAdminModule.forRoot(), AuthModule],
  controllers: [AppController, FirestoreSmokeController],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}
