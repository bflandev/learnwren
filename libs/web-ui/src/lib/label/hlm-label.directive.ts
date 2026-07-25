// Adapted from spartan-ng helm label (MIT). Composes brain's BrnLabel for the
// id/for association. Dimming covers both pairings: `peer-disabled:*` for a
// disabled sibling control, and `data-[disabled=true]:*` via the host
// `data-disabled` — which the consumer drives (see `disabled` below) for nested
// controls the sibling selector can't reach.
import { Directive, booleanAttribute, computed, input } from '@angular/core';
import { BrnLabel } from '@spartan-ng/brain/label';
import { cn } from '../_internal/cn';


// Exported so the lib-wide token-discipline spec can lint this class string
// (stylelint can't see .ts).
//
// `flex items-center gap-2` mirrors canonical spartan: a label that wraps an
// inline control (checkbox/switch + text) lays the pair out on one row with a
// consistent gap. For the common text-only `<label hlmLabel>` it is inert
// (single child, no gap rendered).
//
// `text-field-label` carries the typography role tuple — size (12px),
// line-height, and weight (body-strong 600). Colour rides a separate
// `text-(--lw-field-label)` arbitrary utility because Tailwind v4 picks
// ONE namespace per utility name: when both `--text-field-label` and
// `--color-field-label` exist, the colour namespace wins and the
// typography is silently dropped. PVED-10593 R2 removed
// `--color-field-label` from the app's @theme and applies the colour
// explicitly here so the 12px / gray.700 (light) / gray.400 (dark)
// retune actually reaches HlmLabel hosts. The leading-none rider is
// preserved because the inline pairing wraps controls whose own vertical
// metrics should drive the row height, not the label's line-height.
export const LABEL_BASE =
  'flex items-center gap-2 text-field-label text-(--lw-field-label) leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-70';

@Directive({
  selector: '[hlmLabel]',
  standalone: true,
  hostDirectives: [{ directive: BrnLabel, inputs: ['id', 'for'] }],
  host: {
    '[class]': 'computedClass()',
    // Reflects the consumer-supplied disabled state so the
    // `data-[disabled=true]:*` dimming utilities resolve for nested-control
    // pairings (the sibling `peer-disabled` selector can't reach those).
    '[attr.data-disabled]': 'disabled() ? true : null',
  },
})
export class HlmLabel {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  // Set by the consumer to mirror an associated nested control's disabled
  // state onto the label (BrnLabel does not propagate it). Drives the
  // `data-[disabled=true]:*` dimming via the host `data-disabled` attribute.
  public readonly disabled = input(false, { transform: booleanAttribute });

  // Opt-in pointer affordance for a label that toggles an associated control
  // (checkbox / radio): clicking the label already activates the control via the
  // native `for`/`id` link, so this only swaps the cursor to a pointer so the
  // label reads as clickable. Off by default — a plain field label is not itself
  // an action. The disabled `cursor-not-allowed` still wins (its data-attr /
  // peer-disabled variant is more specific than the bare `cursor-pointer`).
  public readonly interactive = input(false, { transform: booleanAttribute });

  protected readonly computedClass = computed(() =>
    cn(LABEL_BASE, this.interactive() && 'cursor-pointer', this.userClass()),
  );
}
