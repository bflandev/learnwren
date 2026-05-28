import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { AuthService } from '@learnwren/web-auth';
import { LwAvatarComponent } from '@learnwren/web-ui';

import { ProfilePictureError, ProfilePictureService } from './profile-picture.service';

export type UploaderState = 'idle' | 'uploading' | 'failed';

@Component({
  selector: 'lib-profile-picture-uploader',
  standalone: true,
  imports: [LwAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-picture-uploader.component.html',
})
export class ProfilePictureUploaderComponent {
  private readonly svc = inject(ProfilePictureService);
  private readonly auth = inject(AuthService);

  readonly currentUser = this.auth.currentUser;
  readonly state = signal<UploaderState>('idle');
  readonly errorReason = signal<string | null>(null);

  async onFileSelected(file: File): Promise<void> {
    const v = this.svc.validateLocally(file);
    if (!v.ok) {
      this.state.set('failed');
      this.errorReason.set(v.reason);
      return;
    }
    this.state.set('uploading');
    this.errorReason.set(null);
    try {
      const me = await this.svc.upload(file);
      this.auth.setCurrentUser(me);
      this.state.set('idle');
    } catch (err) {
      const e = err as ProfilePictureError;
      this.state.set('failed');
      this.errorReason.set(this.copyForCode(e.code));
    }
  }

  async onRemove(): Promise<void> {
    this.state.set('uploading');
    try {
      const me = await this.svc.remove();
      this.auth.setCurrentUser(me);
      this.state.set('idle');
    } catch (err) {
      const e = err as ProfilePictureError;
      this.state.set('failed');
      this.errorReason.set(this.copyForCode(e.code));
    }
  }

  dismissError(): void {
    this.state.set('idle');
    this.errorReason.set(null);
  }

  private copyForCode(code: string): string {
    switch (code) {
      case 'PROFILE_PICTURE_DIMENSIONS_TOO_SMALL':
        return 'Profile picture must be at least 256×256 pixels.';
      case 'PROFILE_PICTURE_DECODE_FAILED':
        return 'That image could not be read. Try a different file.';
      case 'PROFILE_PICTURE_TOO_LARGE':
        return 'Profile picture must be 2 MB or smaller.';
      case 'UNSUPPORTED_PROFILE_PICTURE_FORMAT':
        return 'Profile picture must be JPEG or PNG.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
}
