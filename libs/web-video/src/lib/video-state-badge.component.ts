import { Component, computed, input } from '@angular/core';

import type { Video } from '@learnwren/shared-data-models';

const STUCK_THRESHOLD_MIN = 30;

@Component({
  selector: 'lib-video-state-badge',
  standalone: true,
  templateUrl: './video-state-badge.component.html',
})
export class VideoStateBadgeComponent {
  readonly video = input.required<Video>();

  readonly label = computed(() => {
    const v = this.video();
    if (this.isStuck(v)) return 'Upload may have stalled — retry?';
    if (v.state === 'UPLOADED') return 'Uploaded — processing pending in EP-03';
    return 'Processing…'; // future-state placeholder; slice B refines
  });

  readonly canRetry = computed(() => this.isStuck(this.video()));

  private isStuck(v: Video): boolean {
    if (v.state !== 'PENDING_UPLOAD') return false;
    const ageMs = Date.now() - new Date(v.updatedAt).getTime();
    return ageMs > STUCK_THRESHOLD_MIN * 60 * 1000;
  }
}
