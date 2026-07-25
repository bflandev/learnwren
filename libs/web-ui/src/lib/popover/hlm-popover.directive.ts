// Adapted from spartan-ng helm popover (MIT). BrnPopover (a signals wrapper over
// @angular/cdk/dialog) renders the content into a CDK overlay anchored to the
// trigger. These wrappers paint the panel on the DS `--lw-popover-*` roles.
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  computed,
  inject,
  input,
} from '@angular/core';
import {
  BrnPopover,
  BrnPopoverContent,
  BrnPopoverTrigger,
} from '@spartan-ng/brain/popover';
import { cn } from '../_internal/cn';

// Exported for the lib-wide token-discipline spec. `block` is load-bearing:
// <hlm-popover-content> is a custom element that defaults to `display: inline`,
// and an inline box won't paint its background/border around block children — the
// panel collapses to nothing without it. `ds-popover-enter` is the fade+scale
// enter (defined in tailwind.css).
export const POPOVER_CONTENT_BASE =
  'ds-popover-enter block z-popover w-72 rounded-md border border-line bg-popover p-4 text-popover-foreground shadow-overlay focus-visible:outline-none';

// `<hlm-popover>` IS a BrnPopover (hostDirective), so projected trigger + content
// resolve it via DI without an explicit `[hlmPopoverTriggerFor]`. `class:
// 'contents'` keeps the host layout-neutral; the panel renders in the CDK overlay.
@Component({
  selector: 'hlm-popover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  exportAs: 'hlmPopover',
  hostDirectives: [
    {
      directive: BrnPopover,
      inputs: [
        'align',
        'sideOffset',
        'offsetX',
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
export class HlmPopover {
  // The composed host directive, resolved via DI — the wrapper delegates
  // open/close to it.
  private readonly _brn = inject(BrnPopover);

  public open(): void {
    this._brn.open();
  }

  public close(): void {
    this._brn.close();
  }
}

// Trigger button — composes BrnPopoverTrigger, re-exposing `brnPopoverTriggerFor`
// as `hlmPopoverTriggerFor`; nested-DI usage (inside `<hlm-popover>`) needs no value.
@Directive({
  selector: 'button[hlmPopoverTrigger],button[hlmPopoverTriggerFor]',
  standalone: true,
  exportAs: 'hlmPopoverTrigger',
  hostDirectives: [
    {
      directive: BrnPopoverTrigger,
      inputs: ['brnPopoverTriggerFor: hlmPopoverTriggerFor', 'id', 'type'],
    },
  ],
})
export class HlmPopoverTrigger {}

// Content panel — used as `<hlm-popover-content *brnPopoverContent>`; brain's
// structural directive hoists it into the CDK overlay.
@Component({
  selector: 'hlm-popover-content',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmPopoverContent {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(POPOVER_CONTENT_BASE, this.userClass()),
  );
}

// Re-export the brain structural directive so consumers don't need a separate
// `@spartan-ng/brain/popover` import.
export { BrnPopoverContent };
