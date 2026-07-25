// Adapted from spartan-ng helm sheet (MIT). A sheet is a side-anchored dialog:
// brain's BrnSheet extends BrnDialog and adds a `side`, so these wrappers mirror
// hlm-dialog and reuse its token-registered overlay/title/description/close bases
// — only the content panel is new (it pins to an edge per `side`). The scrim is
// themed globally via the same `provideHlmDialogConfig` the dialog uses.
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  computed,
  inject,
  input,
} from '@angular/core';
import {
  BrnSheet,
  BrnSheetContent,
  BrnSheetOverlay,
  BrnSheetTrigger,
} from '@spartan-ng/brain/sheet';
import { cn } from '../_internal/cn';
import { DIALOG_OVERLAY_BASE } from '../dialog/hlm-dialog.component';

export const SHEET_SIDES = ['top', 'bottom', 'left', 'right'] as const;
export type SheetSide = (typeof SHEET_SIDES)[number];

// Exported so the lib-wide token-discipline spec can lint these (stylelint can't
// see .ts). Surface roles reuse the DS `--lw-dialog-*` ladder via bg/border/text
// /shadow utilities; the per-side map only adds edge anchoring + size, plus the
// matching `ds-sheet-in-*` slide (keyframe + `--lw-motion-drawer-slide` wiring in
// tailwind.css) so the panel slides in from its edge and stills under reduced-motion.
export const SHEET_CONTENT_BASE =
  'fixed z-dialog flex flex-col gap-4 bg-dialog px-control-x-lg py-control-y-lg text-dialog-foreground shadow-dialog focus-visible:outline-none';
export const SHEET_SIDE_MAP: Record<SheetSide, string> = {
  top: 'ds-sheet-in-top inset-x-0 top-0 w-full border-b border-dialog-border',
  bottom:
    'ds-sheet-in-bottom inset-x-0 bottom-0 w-full border-t border-dialog-border',
  left: 'ds-sheet-in-left inset-y-0 left-0 h-full w-3/4 max-w-sm border-r border-dialog-border',
  right:
    'ds-sheet-in-right inset-y-0 right-0 h-full w-3/4 max-w-sm border-l border-dialog-border',
};

// `<hlm-sheet>` IS a BrnSheet (hostDirective) so projected trigger/content
// children resolve it via DI without an explicit target. `side` picks the edge.
@Component({
  selector: 'hlm-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  exportAs: 'hlmSheet',
  hostDirectives: [
    {
      directive: BrnSheet,
      inputs: [
        'side',
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
export class HlmSheet {}

// Trigger — composes BrnSheetTrigger; `side` can override the sheet's side for
// this trigger. Nested usage inside `<hlm-sheet>` needs no explicit target.
@Directive({
  selector: 'button[hlmSheetTrigger],button[hlmSheetTriggerFor]',
  standalone: true,
  exportAs: 'hlmSheetTrigger',
  hostDirectives: [
    {
      directive: BrnSheetTrigger,
      inputs: ['brnDialogTriggerFor: hlmSheetTriggerFor', 'side', 'id', 'type'],
    },
  ],
})
export class HlmSheetTrigger {}

// Scrim — colour comes from the global `.lw-dialog-backdrop` rule (same as
// dialog), so the base stays var()-free for the token-discipline guard.
@Component({
  selector: 'hlm-sheet-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrnSheetOverlay],
  template: '<brn-sheet-overlay [class]="computedClass()" />',
  host: { class: 'contents' },
})
export class HlmSheetOverlay {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(DIALOG_OVERLAY_BASE, this.userClass()),
  );
}

// Content panel — used as `<hlm-sheet-content *brnSheetContent>`. The side is
// read from the structural brain directive (BrnSheet sets it, including per-
// trigger overrides), so the painted anchoring always matches the real CDK
// placement. Falls back to brain's own default ('top') if it can't be resolved.
@Component({
  selector: 'hlm-sheet-content',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmSheetContent {
  private readonly _brnContent = inject(BrnSheetContent, { optional: true });
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() => {
    const side = this._brnContent?.side() ?? 'top';
    return cn(SHEET_CONTENT_BASE, SHEET_SIDE_MAP[side], this.userClass());
  });
}

// Re-export the structural brain directive needed on the content template.
export { BrnSheetContent };
