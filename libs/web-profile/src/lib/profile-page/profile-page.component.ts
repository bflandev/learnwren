import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '@learnwren/web-auth';
import { LwButtonDirective, LwInputDirective } from '@learnwren/web-ui';
import type { ProfileView, ProfileInvalidErrorBody } from '@learnwren/shared-data-models';

import { ProfileService } from '../profile.service';
import { ProfilePictureUploaderComponent } from '../picture/profile-picture-uploader.component';

type Status = 'idle' | 'saving' | 'saved' | 'error';

@Component({
  selector: 'lib-profile-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, LwInputDirective, LwButtonDirective, ProfilePictureUploaderComponent],
  templateUrl: './profile-page.component.html',
})
export class ProfilePageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly profileSvc = inject(ProfileService);
  private readonly authSvc = inject(AuthService);

  readonly form = this.fb.nonNullable.group({
    // `required` is intentionally omitted — empty-string validation is server-authoritative (see PROFILE_INVALID test).
    displayName: ['', [Validators.maxLength(80)]],
    biography: ['', [Validators.maxLength(1000)]],
  });

  readonly status = signal<Status>('idle');
  readonly readonly = signal<{ email: string; role: ProfileView['role'] } | null>(null);

  async ngOnInit(): Promise<void> {
    const me = await this.profileSvc.getProfile();
    this.form.setValue({ displayName: me.displayName, biography: me.biography });
    this.readonly.set({ email: me.email, role: me.role });
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.status.set('saving');
    try {
      const updated = await this.profileSvc.updateProfile(this.form.getRawValue());
      this.authSvc.setCurrentUser(updated);
      this.status.set('saved');
    } catch (err) {
      this.applyServerError(err);
      this.status.set('error');
    }
  }

  private applyServerError(err: unknown): void {
    if (!(err instanceof HttpErrorResponse) || err.status !== 400) return;
    const body = err.error as ProfileInvalidErrorBody | undefined;
    if (body?.error?.code !== 'PROFILE_INVALID' || !body.error.details) return;
    const { field, reason } = body.error.details;
    if (field === 'displayName' || field === 'biography') {
      this.form.controls[field].setErrors({ server: reason });
    }
  }
}
