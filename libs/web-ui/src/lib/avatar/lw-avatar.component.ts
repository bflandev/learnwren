import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { avatarToneFor, type LwAvatarTone } from './avatar-tone';

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

export function deriveInitials(name: string): string {
  const trimmed = name.trim();
  // Stryker disable next-line ConditionalExpression: equivalent — when trimmed is '' the fall-through yields ''.split(/\s+/) === [''] → first '' → slice(0,2) '' too, so removing this guard returns the same ''.
  if (!trimmed) return '';
  // Stryker disable next-line Regex: equivalent — only words[0] and words[last] are used, and trimmed has no leading/trailing whitespace, so /\s/ vs /\s+/ produce the same first and last tokens.
  const words = trimmed.split(/\s+/);
  // Stryker disable next-line StringLiteral: unreachable — trimmed is non-empty so words[0] is always a defined, non-empty token; the `?? ''` never fires. Equivalent.
  const first = words[0] ?? '';
  if (words.length === 1) {
    return first.slice(0, 2).toUpperCase();
  }
  // Stryker disable next-line StringLiteral: unreachable — words always has ≥1 element so words[words.length-1] is defined; the `?? ''` never fires. Equivalent.
  const last = words[words.length - 1] ?? '';
  // Stryker disable next-line StringLiteral: unreachable — first and last are non-empty words so first[0]/last[0] are defined; the `?? ''` fallbacks never fire. Equivalent.
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}
