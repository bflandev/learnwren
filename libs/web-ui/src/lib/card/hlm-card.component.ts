// Adapted from spartan-ng helm card (MIT).
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { cn } from '../_internal/cn';

// Tailwind v4 ships no default `border-color` and this app has no global
// `* { border-color }` reset, so a bare `border` paints `currentColor`
// (≈ card-foreground) instead of the subtle DS border. `border-line` pins it
// to the registered `--lw-line` role. Bases are exported so the lib-wide
// token-discipline spec can lint these class strings (stylelint can't see .ts).
export const CARD_BASE =
  'block rounded-lg border border-line bg-bg-2 text-ink shadow-raised';
// Grid (mirrors spartan's card header): single column by default so title and
// description stack as rows; a projected `[data-slot=card-action]` switches it to
// two columns and the action spans both rows in column 2.
export const HEADER_BASE =
  'grid auto-rows-min items-start gap-y-1.5 p-6 has-[[data-slot=card-action]]:grid-cols-[1fr_auto] has-[[data-slot=card-description]]:grid-rows-[auto_auto]';
export const TITLE_BASE = 'text-lg font-semibold leading-none tracking-tight';
export const DESCRIPTION_BASE = 'text-sm text-ink-3';
export const CONTENT_BASE = 'block p-6 pt-0';
export const FOOTER_BASE = 'flex items-center p-6 pt-0';
export const ACTION_BASE =
  'col-start-2 row-span-2 row-start-1 self-start justify-self-end';

@Component({
  selector: 'hlm-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmCard {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(CARD_BASE, this.userClass()),
  );
}

@Component({
  selector: 'hlm-card-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmCardHeader {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(HEADER_BASE, this.userClass()),
  );
}

@Component({
  selector: 'hlm-card-title',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmCardTitle {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(TITLE_BASE, this.userClass()),
  );
}

@Component({
  selector: 'hlm-card-description',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { 'data-slot': 'card-description', '[class]': 'computedClass()' },
})
export class HlmCardDescription {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(DESCRIPTION_BASE, this.userClass()),
  );
}

@Component({
  selector: 'hlm-card-content',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmCardContent {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(CONTENT_BASE, this.userClass()),
  );
}

@Component({
  selector: 'hlm-card-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmCardFooter {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(FOOTER_BASE, this.userClass()),
  );
}

// Optional header action (e.g. an icon button), placed top-right of the header
// grid via its `data-slot` marker. Spanning both rows keeps it aligned whether
// the header carries a title only or a title + description.
@Component({
  selector: 'hlm-card-action',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { 'data-slot': 'card-action', '[class]': 'computedClass()' },
})
export class HlmCardAction {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(ACTION_BASE, this.userClass()),
  );
}
