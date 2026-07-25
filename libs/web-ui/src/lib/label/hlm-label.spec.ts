import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HlmLabel } from './hlm-label.directive';

// Mirrors the lib's other directive specs (Vitest globals + jsdom). A small
// host drives the `for` / `class` signal inputs the [hlmLabel] directive
// re-exposes from the hosted BrnLabel brain directive, and binds the label to
// a real <input> so the native association can be asserted.
@Component({
  standalone: true,
  imports: [HlmLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<label
      hlmLabel
      [for]="forId"
      [class]="cls"
      [disabled]="disabled"
      [interactive]="interactive"
      >Email</label
    >
    <input [id]="forId" />`,
})
class TestHost {
  forId = 'ds-demo-input';
  cls = '';
  disabled = false;
  interactive = false;
}

function setup(
  forId = 'ds-demo-input',
  cls = '',
  disabled = false,
  interactive = false,
) {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.forId = forId;
  fixture.componentInstance.cls = cls;
  fixture.componentInstance.disabled = disabled;
  fixture.componentInstance.interactive = interactive;
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector('label') as HTMLLabelElement;
  return { fixture, host };
}

describe('HlmLabel', () => {
  it('carries the helm BASE classes on the host (flex cluster + text-field-label role + explicit colour + leading-none)', () => {
    const { host } = setup();
    // Inline label+control cluster layout (canonical spartan).
    expect(host.classList.contains('flex')).toBe(true);
    expect(host.classList.contains('items-center')).toBe(true);
    expect(host.classList.contains('gap-2')).toBe(true);
    // PVED-10593: typography (size + line-height + weight) rides the
    // `text-field-label` role utility.
    expect(host.classList.contains('text-field-label')).toBe(true);
    // PVED-10593 R2: colour rides the separate `text-(--lw-field-label)`
    // arbitrary utility because Tailwind v4 picks ONE namespace per
    // utility name — `--color-field-label` was dropped from the app's
    // @theme to keep `text-field-label` pure-typography. Without this
    // second utility the gray.700 / gray.400 softening never reaches
    // the host (regression caught by the design-system R2 review).
    expect(host.classList.contains('text-(--lw-field-label)')).toBe(true);
    expect(host.classList.contains('leading-none')).toBe(true);
  });

  it('carries the peer-disabled dimming pair from the helm BASE', () => {
    const { host } = setup();
    expect(host.classList.contains('peer-disabled:cursor-not-allowed')).toBe(
      true,
    );
    expect(host.classList.contains('peer-disabled:opacity-70')).toBe(true);
  });

  // BEHAVIOURAL: for nested-control pairings (e.g. the switch) the sibling
  // `peer-disabled` selector can never fire, so dimming rides the host
  // `data-disabled` attribute instead. BrnLabel does NOT write it; the
  // consumer reflects the control's disabled state via the `[disabled]` input.
  // This asserts the binding actually sets `data-disabled="true"` (so the
  // `data-[disabled=true]:*` utilities have a target) — it fails if the
  // `[attr.data-disabled]` host binding is removed, unlike a class-string
  // presence check which is true regardless of behaviour.
  it('reflects disabled=true onto the host data-disabled attribute (dimming fires)', () => {
    const { host } = setup('ds-demo-input', '', true);
    expect(host.getAttribute('data-disabled')).toBe('true');
    // The dimming utility targeting that attribute is present on the host.
    expect(host.classList.contains('data-[disabled=true]:opacity-70')).toBe(
      true,
    );
  });

  it('does not set data-disabled when disabled=false', () => {
    const { host } = setup('ds-demo-input', '', false);
    expect(host.hasAttribute('data-disabled')).toBe(false);
  });

  it('merges a consumer class token onto the host', () => {
    const { host } = setup('ds-demo-input', 'mb-2');
    expect(host.classList.contains('mb-2')).toBe(true);
    expect(host.classList.contains('text-field-label')).toBe(true);
  });

  // BrnLabel binds `[attr.for]="_for()"` to the host, so the re-exposed `for`
  // input flows back out to the native `for` attribute — the label/input
  // association the helm label relies on still works.
  it('passes the `for` input through to the native for attribute (BrnLabel composed)', () => {
    const { host } = setup('ds-demo-input');
    expect(host.getAttribute('for')).toBe('ds-demo-input');
  });

  // BrnLabel binds `[id]="id()"` with a generated `brn-label-N` default, so a
  // composed-but-unconfigured label still gets an id. Proves the brain
  // directive is actually instantiated on the host.
  it('lets BrnLabel stamp its generated id onto the host', () => {
    const { host } = setup();
    expect(host.id).toMatch(/^brn-label-\d+$/);
  });

  // PVED-10656: a label tied to a checkbox/radio reads as clickable (the native
  // for/id link already toggles the control); `interactive` only swaps in the
  // pointer cursor. Off by default — a plain field label is not an action.
  it('adds cursor-pointer when interactive', () => {
    const { host } = setup('ds-demo-input', '', false, true);
    expect(host.classList.contains('cursor-pointer')).toBe(true);
  });

  it('omits cursor-pointer by default', () => {
    const { host } = setup();
    expect(host.classList.contains('cursor-pointer')).toBe(false);
  });
});
