import { Component, EventEmitter, Output, input } from '@angular/core';

import type {
  CourseId,
  LessonId,
  ModuleId,
  VideoId,
} from '@learnwren/shared-data-models';

import { VideoUploadService } from './video-upload.service';

@Component({
  selector: 'lib-video-upload',
  standalone: true,
  templateUrl: './video-upload.component.html',
  providers: [VideoUploadService],
})
export class VideoUploadComponent {
  readonly courseId = input.required<CourseId>();
  readonly moduleId = input.required<ModuleId>();
  readonly lessonId = input.required<LessonId>();
  @Output() readonly uploaded = new EventEmitter<VideoId>();

  constructor(readonly svc: VideoUploadService) {}

  async onFile(file: File | null): Promise<void> {
    if (!file) return;
    await this.svc.start(
      { courseId: this.courseId(), moduleId: this.moduleId(), lessonId: this.lessonId() },
      file,
    );
    const s = this.svc.state();
    if (s.kind === 'complete') this.uploaded.emit(s.videoId);
  }

  onCancel(): void {
    void this.svc.cancel();
  }

  onRetry(): void {
    void this.svc.retry();
  }
}
