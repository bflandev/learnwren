export { CoursesModule } from './lib/courses.module';
export { CoursesRepository } from './lib/courses.repository';
export { CourseOwnerGuard } from './lib/course-owner.guard';
export {
  LessonNotFoundException,
  ModuleNotFoundException,
} from './lib/errors/courses.exception';
export { VideoModule } from './lib/video/video.module';
export { VideoService } from './lib/video/video.service';
export {
  VIDEO_CONFIG,
  type VideoConfig,
  readVideoConfigFromEnv,
} from './lib/video/video.config';
