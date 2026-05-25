import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';

import type { LessonId, ModuleId, PublishBlockReason } from '@learnwren/shared-data-models';

import { LwButtonDirective } from '@learnwren/web-ui';

import { PublishEligibilityService } from './publish-eligibility.service';

@Component({
  selector: 'lib-publish-eligibility-panel',
  standalone: true,
  imports: [LwButtonDirective],
  templateUrl: './publish-eligibility-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublishEligibilityPanelComponent {
  readonly jumpToModule = output<ModuleId>();
  readonly jumpToLesson = output<LessonId>();

  protected readonly publishSvc = inject(PublishEligibilityService);

  protected readonly eligibility = this.publishSvc.eligibility;
  protected readonly lastError = this.publishSvc.lastError;
  protected readonly reasonCount = computed(() => {
    const e = this.eligibility();
    return e && !e.eligible ? e.reasons.length : 0;
  });

  protected isEligible(): boolean {
    return this.eligibility()?.eligible === true;
  }

  protected jumpLinkVisible(r: PublishBlockReason): 'lesson' | 'module' | null {
    if (r.kind === 'MODULE_HAS_NO_LESSONS') return 'module';
    if (r.kind === 'LESSON_HAS_NO_VIDEO') return 'lesson';
    if (r.kind === 'LESSON_VIDEO_NOT_READY' && r.currentState === 'FAILED') return 'lesson';
    return null;
  }

  protected reasonText(r: PublishBlockReason): string {
    switch (r.kind) {
      case 'COURSE_HAS_NO_MODULES':
        return 'Add a module before publishing.';
      case 'MODULE_HAS_NO_LESSONS':
        return `Module "${r.moduleTitle}" has no lessons.`;
      case 'LESSON_HAS_NO_VIDEO':
        return `${r.moduleTitle} › ${r.lessonTitle} — no video uploaded yet.`;
      case 'LESSON_VIDEO_NOT_READY': {
        const txt = r.currentState === 'TRANSCODING'
          ? 'Video is still transcoding. Status will update automatically.'
          : r.currentState === 'UPLOADING' || r.currentState === 'UPLOADED' || r.currentState === 'PENDING_UPLOAD'
            ? 'Video upload is in progress.'
            : 'Video processing failed — re-upload required.';
        return `${r.moduleTitle} › ${r.lessonTitle} — ${txt}`;
      }
      default:
        return '';
    }
  }

  protected onJump(r: PublishBlockReason): void {
    const link = this.jumpLinkVisible(r);
    if (link === 'module' && r.kind === 'MODULE_HAS_NO_LESSONS') this.jumpToModule.emit(r.moduleId);
    if (link === 'lesson' && (r.kind === 'LESSON_HAS_NO_VIDEO' || r.kind === 'LESSON_VIDEO_NOT_READY'))
      this.jumpToLesson.emit(r.lessonId);
  }
}
