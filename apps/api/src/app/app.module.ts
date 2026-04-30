import { Module } from '@nestjs/common';
import { FirebaseAdminModule } from '@learnwren/api-firebase';
import { AppController } from './app.controller';

@Module({
  imports: [FirebaseAdminModule.forRoot()],
  controllers: [AppController],
})
export class AppModule {}
