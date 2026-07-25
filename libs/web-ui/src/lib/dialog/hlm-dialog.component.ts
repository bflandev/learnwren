// Adapted from spartan-ng helm dialog (MIT). BrnDialog is a signals wrapper over
// @angular/cdk/dialog; the panel renders into a CDK overlay. These wrappers paint
// the panel + parts on the DS's `--lw-dialog-*` roles. The scrim is themed
// globally (see `provideHlmDialogConfig` + the `.lw-dialog-backdrop` CSS rule)
// so every class string here stays var()-free for the token-discipline guard.
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  type Provider,
  computed,
  input,
} from '@angular/core';
import {
  BrnDialog,
  BrnDialogContent,
  BrnDialogOverlay,
  BrnDialogTrigger,
  provideBrnDialogDefaultOptions,
} from '@spartan-ng/brain/dialog';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint these class strings
// (stylelint can't see .ts).
export const DIALOG_OVERLAY_BASE = 'fixed inset-0 z-dialog-backdrop';
// `ds-dialog-enter` is the fade+zoom enter (keyframe + token wiring in
// tailwind.css); it rides `--lw-motion-dialog-enter` so reduced-motion stills it.
export const DIALOG_CONTENT_BASE =
  'ds-dialog-enter fixed left-1/2 top-1/2 z-dialog grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-dialog bg-dialog px-control-x-lg py-control-y-lg text-dialog-foreground shadow-dialog focus-visible:outline-none';
export const DIALOG_HEADER_BASE =
  'flex flex-col gap-1.5 text-center sm:text-left';
export const DIALOG_FOOTER_BASE =
  'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end';
// `text-section-title` already brings size + line-height + weight (600 since
// PVED-10548 typeset pass aligned the role to actual usage). `leading-none`
// tightens it for the single-line dialog header where the natural section-title
// 26px LH would float; `tracking-tight` is the typography refinement the role
// doesn't encode. `font-semibold` was redundant once the role weight bumped to
// 600 and has been removed so the role is the single source of truth for weight.
export const DIALOG_TITLE_BASE =
  'text-section-title leading-none tracking-tight';
export const DIALOG_DESCRIPTION_BASE = 'text-body text-ink-3';
export const DIALOG_CLOSE_BASE =
  'absolute right-3 top-3 rounded-control opacity-70 transition-opacity hover:opacity-100 focus-ring';

// `<hlm-dialog>` IS a BrnDialog (hostDirective) so projected trigger/content
// children resolve BrnDialog via DI without an explicit `[hlmDialogTriggerFor]`.
// `host.class = 'contents'` keeps the element layout-neutral; the rendered panel
// lives in the CDK overlay, not under this host.
@Component({
  selector: 'hlm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  exportAs: 'hlmDialog',
  hostDirectives: [
    {
      directive: BrnDialog,
      inputs: [
        'role',
        'hasBackdrop',
        'closeOnBackdropClick',
        'closeOnOutsidePointerEvents',
        'disableClose',
        'restoreFocus',
        'autoFocus',
        'closeDelay',
        'attachTo',
        'attachPositions',
        'state',
        'aria-label',
        'aria-labelledby',
        'aria-describedby',
        'aria-modal',
      ],
      outputs: ['closed', 'stateChanged'],
    },
  ],
  host: { class: 'contents' },
})
export class HlmDialog {}

// Trigger button — composes BrnDialogTrigger. The `brnDialogTriggerFor` input
// is re-exposed as `hlmDialogTriggerFor` so consumers can pass an explicit
// dialog reference; nested-DI usage (inside `<hlm-dialog>`) needs no value.
@Directive({
  selector: 'button[hlmDialogTrigger],button[hlmDialogTriggerFor]',
  standalone: true,
  exportAs: 'hlmDialogTrigger',
  hostDirectives: [
    {
      directive: BrnDialogTrigger,
      inputs: ['brnDialogTriggerFor: hlmDialogTriggerFor', 'id', 'type'],
    },
  ],
})
export class HlmDialogTrigger {}

// Wraps `<brn-dialog-overlay>` so the structural overlay class stays token-pure.
// The scrim COLOUR is applied via the global `.lw-dialog-backdrop` rule, not
// here, so `DIALOG_OVERLAY_BASE` contains no `var(`.
@Component({
  selector: 'hlm-dialog-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrnDialogOverlay],
  template: '<brn-dialog-overlay [class]="computedClass()" />',
  host: { class: 'contents' },
})
export class HlmDialogOverlay {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(DIALOG_OVERLAY_BASE, this.userClass()),
  );
}

// Content panel — used as `<hlm-dialog-content *brnDialogContent>`. The
// structural `*brnDialogContent` from brain hoists this into the CDK overlay;
// the host class paints the panel surface on `--lw-dialog-*` roles.
@Component({
  selector: 'hlm-dialog-content',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmDialogContent {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(DIALOG_CONTENT_BASE, this.userClass()),
  );
}

// Re-export the structural brain directive consumers need on the content
// template; this keeps `<hlm-dialog-content *brnDialogContent>` usable without
// an extra import from `@spartan-ng/brain/dialog`. (The unified
// `HlmDialogImports` array — including the parts in hlm-dialog.parts.ts — is
// assembled in this folder's `index.ts` to avoid a parts↔component cycle.)
export { BrnDialogContent };

// Supplies helm-flavoured BrnDialog defaults — most importantly the
// `backdropClass` brain sets on the CDK overlay backdrop. The colour itself
// lives in the lib global CSS layer (`.lw-dialog-backdrop` in hlm-globals.css),
// because the lib-wide token-discipline spec bans raw `var()` in TS strings.
export function provideHlmDialogConfig(): Provider {
  return provideBrnDialogDefaultOptions({
    hasBackdrop: true,
    backdropClass: 'lw-dialog-backdrop',
    closeOnBackdropClick: true,
  });
}
