// Adapted from spartan-ng helm form-field (MIT). A layout wrapper that stacks a
// label, control, and hint/error message with the DS form-field gap — the
// consistency primitive for single-record forms. Hint and error are thin
// directives so their typography stays on the DS helper role; the error carries
// role="alert" so a validation message announces when it appears.
//
// The lib defers brain's field-control context (BrnField, alpha) but closes the
// accessibility gap it would otherwise leave: hlmFormFieldHint / hlmFormFieldError
// mint a stable id and register it with the enclosing hlm-form-field, and
// hlmFormFieldControl on the control mirrors those ids onto aria-describedby — so
// the programmatic association assistive tech reads on focus is wired
// automatically, with no manual id bookkeeping in the template.
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  type OnDestroy,
  type OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { cn } from '../_internal/cn';

// Exported so the lib-wide token-discipline spec can lint these class strings.
export const FORM_FIELD_BASE = 'flex flex-col gap-form-field-gap';
export const FORM_FIELD_HINT_BASE = 'text-helper text-ink-3';
export const FORM_FIELD_ERROR_BASE = 'text-helper text-bad';

// Module-level id counters (mirrors hlm-switch's nextId convention) so a bare
// hint/error with no author id still gets a stable, targetable id.
let nextHintId = 0;
let nextErrorId = 0;

@Component({
  selector: 'hlm-form-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  // role="group" gives the label/control/message cluster a single accessible
  // grouping (mirrors spartan's field container).
  host: { role: 'group', '[class]': 'computedClass()' },
})
export class HlmFormField {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(FORM_FIELD_BASE, this.userClass()),
  );

  // Registered hint/error ids, kept apart so describedBy lists hints before
  // errors (the DOM order assistive tech expects).
  private readonly hintIds = signal<readonly string[]>([]);
  private readonly errorIds = signal<readonly string[]>([]);

  // The space-joined id list a sibling hlmFormFieldControl mirrors onto
  // aria-describedby; null when nothing is registered so the attribute is absent.
  public readonly describedBy = computed<string | null>(() => {
    const ids = [...this.hintIds(), ...this.errorIds()];
    return ids.length ? ids.join(' ') : null;
  });

  public registerHint(id: string): void {
    this.hintIds.update((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }

  public unregisterHint(id: string): void {
    this.hintIds.update((ids) => ids.filter((existing) => existing !== id));
  }

  public registerError(id: string): void {
    this.errorIds.update((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }

  public unregisterError(id: string): void {
    this.errorIds.update((ids) => ids.filter((existing) => existing !== id));
  }
}

// Lib sub-part convention: a sub-part that mints its own element is a component
// (e.g. hlm-alert-title); one that decorates an existing element is an attribute
// directive (e.g. hlmFormFieldHint / hlmFormFieldError below). Both mint a stable
// id and register it with the enclosing field so the control can describe itself.
@Directive({
  selector: '[hlmFormFieldHint]',
  standalone: true,
  host: {
    '[id]': 'id()',
    '[class]': 'computedClass()',
  },
})
export class HlmFormFieldHint implements OnInit, OnDestroy {
  private readonly field = inject(HlmFormField, { optional: true });

  // Defaults to a generated id (rather than null) so a bare hint is targetable;
  // an author-supplied id overrides it, and it is host-bound onto the element.
  public readonly id = input<string>(`hlm-form-field-hint-${nextHintId++}`);

  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(FORM_FIELD_HINT_BASE, this.userClass()),
  );

  private registeredId: string | null = null;

  public ngOnInit(): void {
    this.registeredId = this.id();
    this.field?.registerHint(this.registeredId);
  }

  public ngOnDestroy(): void {
    if (this.registeredId) {
      this.field?.unregisterHint(this.registeredId);
    }
  }
}

@Directive({
  selector: '[hlmFormFieldError]',
  standalone: true,
  host: {
    role: 'alert',
    '[id]': 'id()',
    '[class]': 'computedClass()',
  },
})
export class HlmFormFieldError implements OnInit, OnDestroy {
  private readonly field = inject(HlmFormField, { optional: true });

  public readonly id = input<string>(`hlm-form-field-error-${nextErrorId++}`);

  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    cn(FORM_FIELD_ERROR_BASE, this.userClass()),
  );

  private registeredId: string | null = null;

  public ngOnInit(): void {
    this.registeredId = this.id();
    this.field?.registerError(this.registeredId);
  }

  public ngOnDestroy(): void {
    if (this.registeredId) {
      this.field?.unregisterError(this.registeredId);
    }
  }
}

// Apply to the control inside an hlm-form-field. It mirrors the field's
// registered hint/error ids onto aria-describedby (preserving any author-supplied
// value), so the control announces its hint/error with no manual id wiring.
@Directive({
  selector: '[hlmFormFieldControl]',
  standalone: true,
  host: {
    '[attr.aria-describedby]': 'describedBy()',
  },
})
export class HlmFormFieldControl {
  private readonly field = inject(HlmFormField, { optional: true });

  // Author-supplied aria-describedby, merged ahead of the field's ids. Reading
  // the input and writing the host attr are separate channels, so there is no
  // feedback loop. The alias mirrors the native attribute name by design.
  public readonly ariaDescribedBy = input<string | null>(null, {
    // eslint-disable-next-line @angular-eslint/no-input-rename
    alias: 'aria-describedby',
  });

  protected readonly describedBy = computed<string | null>(() => {
    const ids = [
      this.ariaDescribedBy(),
      this.field?.describedBy() ?? null,
    ].filter((value): value is string => !!value);
    return ids.length ? ids.join(' ') : null;
  });
}
