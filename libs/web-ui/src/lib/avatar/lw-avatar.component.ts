import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { avatarToneFor, deriveInitials, type LwAvatarTone } from '../avatar-tone/avatar-tone';

@Component({
  selector: 'lw-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (photoUrl()) {
      <img
        class="lw-avatar-image"
        [src]="photoUrl()"
        [alt]="alt() || displayName()"
        loading="lazy"
      />
    } @else {
      <span class="lw-avatar-initials">{{ initials() }}</span>
    }
  `,
  host: {
    class: 'lw-avatar',
    '[attr.data-tone]': 'tone()',
    '[attr.data-size]': 'size()',
  },
})
export class LwAvatarComponent {
  readonly photoUrl = input<string | undefined>(undefined);
  readonly displayName = input.required<string>();
  readonly userId = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly alt = input<string>('');

  readonly tone = computed<LwAvatarTone>(() => avatarToneFor(this.userId()));
  readonly initials = computed<string>(() => deriveInitials(this.displayName()));
}
