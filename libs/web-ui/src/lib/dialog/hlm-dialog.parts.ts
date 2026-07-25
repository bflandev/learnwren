// Adapted from spartan-ng helm dialog (MIT). Small structural + a11y parts that
// compose the brain title/description (which wire aria-labelledby /
// aria-describedby on the dialog) and brain close (calls close() on the parent
// BrnDialogRef). Bases here are picked up by token-discipline.spec.ts.
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  computed,
  input,
} from '@angular/core';
import {
  BrnDialogClose,
  BrnDialogDescription,
  BrnDialogTitle,
} from '@spartan-ng/brain/dialog';
import { cn } from '../_internal/cn';
import {
  DIALOG_CLOSE_BASE,
  DIALOG_DESCRIPTION_BASE,
  DIALOG_FOOTER_BASE,
  DIALOG_HEADER_BASE,
  DIALOG_TITLE_BASE,
} from './hlm-dialog.component';

@Component({
  selector: 'hlm-dialog-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmDialogHeader {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(DIALOG_HEADER_BASE, this.userClass()),
  );
}

@Component({
  selector: 'hlm-dialog-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'computedClass()' },
})
export class HlmDialogFooter {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(DIALOG_FOOTER_BASE, this.userClass()),
  );
}

// `[hlmDialogTitle]` accepts any heading level (h1..h4) or a bare element; the
// composed BrnDialogTitle directive generates the id and wires it to
// `aria-labelledby` on the dialog panel.
@Directive({
  selector:
    'h1[hlmDialogTitle],h2[hlmDialogTitle],h3[hlmDialogTitle],h4[hlmDialogTitle],[hlmDialogTitle]',
  standalone: true,
  hostDirectives: [BrnDialogTitle],
  host: { '[class]': 'computedClass()' },
})
export class HlmDialogTitle {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(DIALOG_TITLE_BASE, this.userClass()),
  );
}

// `[hlmDialogDescription]` composes BrnDialogDescription, which wires the host
// id to `aria-describedby` on the dialog panel.
@Directive({
  selector: 'p[hlmDialogDescription],[hlmDialogDescription]',
  standalone: true,
  hostDirectives: [BrnDialogDescription],
  host: { '[class]': 'computedClass()' },
})
export class HlmDialogDescription {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(DIALOG_DESCRIPTION_BASE, this.userClass()),
  );
}

// Close button — composes brain's BrnDialogClose (which calls parent
// BrnDialogRef.close() on click). The `delay` input is forwarded for use cases
// that want a brief exit-animation window before tearing the overlay down.
@Directive({
  selector: 'button[hlmDialogClose]',
  standalone: true,
  exportAs: 'hlmDialogClose',
  hostDirectives: [{ directive: BrnDialogClose, inputs: ['delay'] }],
  host: { '[class]': 'computedClass()' },
})
export class HlmDialogClose {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(DIALOG_CLOSE_BASE, this.userClass()),
  );
}
