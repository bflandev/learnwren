import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';

import type { VideoCaptionsMeta, VideoId } from '@learnwren/shared-data-models';
import { HlmButton } from '@learnwren/web-ui';

import { CaptionsService } from './captions.service';

@Component({
  selector: 'lib-captions-panel',
  standalone: true,
  imports: [HlmButton],
  templateUrl: './captions-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptionsPanelComponent implements OnInit {
  private readonly svc = inject(CaptionsService);

  readonly videoId = input.required<VideoId>();

  readonly metaChange = output<VideoCaptionsMeta | null>();

  readonly meta = signal<VideoCaptionsMeta | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const loaded = await this.svc.getMeta(this.videoId());
      this.meta.set(loaded);
      this.metaChange.emit(loaded);
    } catch {
      // Non-fatal: leave meta null; the add affordance still works.
      this.metaChange.emit(null);
    }
  }

  async onFileChosen(file: File): Promise<void> {
    this.error.set(null);
    const check = this.svc.validateLocally(file);
    if (!check.ok) {
      this.error.set(check.reason);
      return;
    }
    this.busy.set(true);
    try {
      const uploaded = await this.svc.upload(this.videoId(), file);
      this.meta.set(uploaded);
      this.metaChange.emit(uploaded);
    } catch {
      this.error.set('Upload failed. Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  async onRemove(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.svc.remove(this.videoId());
      this.meta.set(null);
      this.metaChange.emit(null);
    } catch {
      this.error.set('Remove failed. Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.onFileChosen(file);
    input.value = '';
  }
}
