import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

import { nowIso } from '@learnwren/shared-data-models';
import type { CourseId, ISODateString } from '@learnwren/shared-data-models';
import {
  LwButtonDirective,
  LwCardComponent,
  LwCoverComponent,
  LwProgressComponent,
} from '@learnwren/web-ui';

import { CourseCoverService } from './course-cover.service';

export type UploaderState =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'failed'; reason: string };

@Component({
  selector: 'lib-course-cover-uploader',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LwButtonDirective, LwCardComponent, LwCoverComponent, LwProgressComponent],
  templateUrl: './course-cover-uploader.component.html',
})
export class CourseCoverUploaderComponent {
  private readonly svc = inject(CourseCoverService);

  readonly courseId = input.required<CourseId>();
  readonly currentCoverUrl = input<string | undefined>(undefined);

  @Output() readonly coverChanged = new EventEmitter<{
    coverImageUrl: string | undefined;
    updatedAt: ISODateString;
  }>();

  readonly state = signal<UploaderState>({ kind: 'idle' });

  readonly failedState = computed(() => {
    const s = this.state();
    return s.kind === 'failed' ? s : null;
  });

  async onFileSelected(file: File): Promise<void> {
    const local = this.svc.validateLocally(file);
    if (!local.ok) {
      this.state.set({ kind: 'failed', reason: local.reason });
      return;
    }
    this.state.set({ kind: 'uploading' });
    try {
      const out = await this.svc.upload(this.courseId(), file);
      this.coverChanged.emit({ coverImageUrl: out.coverImageUrl, updatedAt: out.updatedAt });
      this.state.set({ kind: 'idle' });
    } catch (err) {
      this.state.set({ kind: 'failed', reason: this.extractReason(err) });
    }
  }

  onFileInput(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    if (file) void this.onFileSelected(file);
    inputEl.value = '';
  }

  async onRemove(): Promise<void> {
    this.state.set({ kind: 'uploading' });
    try {
      await this.svc.remove(this.courseId());
      this.coverChanged.emit({
        coverImageUrl: undefined,
        updatedAt: nowIso(),
      });
      this.state.set({ kind: 'idle' });
    } catch (err) {
      this.state.set({ kind: 'failed', reason: this.extractReason(err) });
    }
  }

  onRetry(): void {
    this.state.set({ kind: 'idle' });
  }

  private extractReason(err: unknown): string {
    const body = (err as { error?: { error?: { message?: string } } })?.error?.error;
    return body?.message ?? 'Cover image upload failed.';
  }
}
