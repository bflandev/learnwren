// Adapted from spartan-ng helm sheet (MIT). Title/description compose brain's
// sheet title/description (which wire aria-labelledby / aria-describedby on the
// panel); close composes brain's sheet close (calls close() on the parent
// BrnDialogRef). All three reuse the dialog part bases — a sheet's chrome is the
// same as a dialog's — so no new class strings are introduced here.
import { Directive, computed, input } from '@angular/core';
import {
  BrnSheetClose,
  BrnSheetDescription,
  BrnSheetTitle,
} from '@spartan-ng/brain/sheet';
import { cn } from '../_internal/cn';
import {
  DIALOG_CLOSE_BASE,
  DIALOG_DESCRIPTION_BASE,
  DIALOG_TITLE_BASE,
} from '../dialog/hlm-dialog.component';

@Directive({
  selector:
    'h1[hlmSheetTitle],h2[hlmSheetTitle],h3[hlmSheetTitle],h4[hlmSheetTitle],[hlmSheetTitle]',
  standalone: true,
  hostDirectives: [BrnSheetTitle],
  host: { '[class]': 'computedClass()' },
})
export class HlmSheetTitle {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(DIALOG_TITLE_BASE, this.userClass()),
  );
}

@Directive({
  selector: 'p[hlmSheetDescription],[hlmSheetDescription]',
  standalone: true,
  hostDirectives: [BrnSheetDescription],
  host: { '[class]': 'computedClass()' },
})
export class HlmSheetDescription {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(DIALOG_DESCRIPTION_BASE, this.userClass()),
  );
}

// Styled corner-X close. Composes brain's BrnSheetClose; `delay` is forwarded
// for an exit-animation window before the overlay tears down.
@Directive({
  selector: 'button[hlmSheetClose]',
  standalone: true,
  exportAs: 'hlmSheetClose',
  hostDirectives: [{ directive: BrnSheetClose, inputs: ['delay'] }],
  host: { '[class]': 'computedClass()' },
})
export class HlmSheetClose {
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(DIALOG_CLOSE_BASE, this.userClass()),
  );
}
