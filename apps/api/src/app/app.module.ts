import { Module } from '@nestjs/common';
import { FirebaseAdminModule } from '@learnwren/api-firebase';
import { AppController } from './app.controller';
import { FirestoreSmokeController } from './firestore-smoke/firestore-smoke.controller';

@Module({
  imports: [FirebaseAdminModule.forRoot()],
  controllers: [AppController, FirestoreSmokeController],
})
export class AppModule {}
