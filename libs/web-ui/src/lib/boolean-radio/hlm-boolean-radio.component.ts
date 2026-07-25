// A true/false preset over the native radio set: two mutually-exclusive
// hlmRadio inputs (Yes / No by default, both labels customizable) bound to one
// two-way boolean model. brain owns no radio primitive, so this composes the
// platform radios directly — the [name] groups them so the browser enforces the
// single-selection invariant and arrow-key roving for free.
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  model,
} from '@angular/core';
import { cn } from '../_internal/cn';
import { HlmLabel } from '../label/hlm-label.directive';
import { HlmRadio } from '../radio/hlm-radio.directive';

// Exported so the lib-wide token-discipline spec can lint this class string.
export const BOOLEAN_RADIO_BASE = 'flex items-center gap-6';

let nextId = 0;

@Component({
  selector: 'hlm-boolean-radio',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmRadio, HlmLabel],
  host: { '[class]': 'computedClass()' },
  template: `
    <div class="flex items-center gap-2">
      <input
        hlmRadio
        type="radio"
        [name]="name()"
        [id]="trueId"
        [checked]="value() === true"
        [disabled]="disabled()"
        (change)="select(true)"
      />
      <label hlmLabel [for]="trueId" [disabled]="disabled()">{{
        trueLabel()
      }}</label>
    </div>
    <div class="flex items-center gap-2">
      <input
        hlmRadio
        type="radio"
        [name]="name()"
        [id]="falseId"
        [checked]="value() === false"
        [disabled]="disabled()"
        (change)="select(false)"
      />
      <label hlmLabel [for]="falseId" [disabled]="disabled()">{{
        falseLabel()
      }}</label>
    </div>
  `,
})
export class HlmBooleanRadio {
  private readonly uid = nextId++;
  // Stable ids so each radio pairs with its own label[for] (click-to-select).
  protected readonly trueId = `hlm-boolean-radio-${this.uid}-true`;
  protected readonly falseId = `hlm-boolean-radio-${this.uid}-false`;

  // Shared radio-group name; defaults unique-per-instance so two presets on a
  // page never bleed selection into each other.
  public readonly name = input<string>(`hlm-boolean-radio-${this.uid}`);

  public readonly trueLabel = input<string>('Yes');
  public readonly falseLabel = input<string>('No');
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly disabled = input(false, { transform: booleanAttribute });

  // Two-way value: null = unselected (neither radio checked), true / false the
  // two states. The auto-generated valueChange output re-exposes the change.
  public readonly value = model<boolean | null>(null);

  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  public readonly userClass = input<string>('', { alias: 'class' });

  protected readonly computedClass = computed(() =>
    cn(BOOLEAN_RADIO_BASE, this.userClass()),
  );

  protected select(next: boolean): void {
    this.value.set(next);
  }
}
