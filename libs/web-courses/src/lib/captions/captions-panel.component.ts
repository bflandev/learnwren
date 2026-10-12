import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';

import { MAX_CAPTION_TRACKS, apiErrorOf } from '@learnwren/shared-data-models';
import type { VideoCaptionsMeta, VideoId } from '@learnwren/shared-data-models';
import { HlmButton, HlmInput } from '@learnwren/web-ui';

import { captionLanguageOptions } from './caption-languages';
import { CaptionsService } from './captions.service';

const DEFAULT_LANGUAGE = 'en';

function byLabel(a: VideoCaptionsMeta, b: VideoCaptionsMeta): number {
  return a.label.localeCompare(b.label);
}

@Component({
  selector: 'lib-captions-panel',
  standalone: true,
  imports: [HlmButton, HlmInput],
  templateUrl: './captions-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptionsPanelComponent implements OnInit {
  private readonly svc = inject(CaptionsService);

  readonly videoId = input.required<VideoId>();

  readonly tracksChange = output<VideoCaptionsMeta[]>();

  readonly languageOptions = captionLanguageOptions();
  readonly tracks = signal<VideoCaptionsMeta[]>([]);
  readonly language = signal(DEFAULT_LANGUAGE);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  /** The server's track list is unknown; uploading would act on a partial list. */
  readonly loadFailed = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      this.setTracks(await this.svc.list(this.videoId()));
    } catch {
      // Say so rather than show "no tracks" (and emit [], which would wipe the
      // preview player's captions). Upload stays disabled until a reload: it
      // would act on a list we never saw.
      this.loadFailed.set(true);
      this.error.set("Couldn't load the caption tracks. Reload the page to try again.");
    }
  }

  async onFileChosen(file: File): Promise<void> {
    if (this.loadFailed()) return;
    this.error.set(null);
    const check = this.svc.validateLocally(file);
    if (!check.ok) {
      this.error.set(check.reason);
      return;
    }
    this.busy.set(true);
    try {
      const uploaded = await this.svc.upload(this.videoId(), this.language(), file);
      const others = this.tracks().filter((t) => t.language !== uploaded.language);
      this.setTracks([...others, uploaded].sort(byLabel));
    } catch (err) {
      const code = apiErrorOf(err)?.code;
      this.error.set(uploadErrorMessage(code));
    } finally {
      this.busy.set(false);
    }
  }

  async onRemove(language: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.svc.remove(this.videoId(), language);
      this.setTracks(this.tracks().filter((t) => t.language !== language));
    } catch {
      this.error.set('Remove failed. Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  onLanguageChange(event: Event): void {
    this.language.set((event.target as HTMLSelectElement).value);
  }

  onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.onFileChosen(file);
    input.value = '';
  }

  private setTracks(tracks: VideoCaptionsMeta[]): void {
    this.tracks.set(tracks);
    this.tracksChange.emit(tracks);
  }
}

function uploadErrorMessage(code: string | undefined): string {
  if (code === 'CAPTION_TRACK_LIMIT') {
    return `This video already has the maximum of ${MAX_CAPTION_TRACKS} caption languages. Remove one first.`;
  }
  if (code === 'INVALID_CAPTION_FILE') {
    // Retrying the same file cannot help, so say what is wrong with it.
    return 'This file is not a valid WebVTT caption file: it must start with "WEBVTT" and contain at least one timed cue.';
  }
  return 'Upload failed. Try again.';
}
