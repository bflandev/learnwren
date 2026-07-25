import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { HlmSwitch } from './hlm-switch.component';

// Mirrors the lib's other component specs (Vitest globals + jsdom). A small
// host drives the `checked` / `disabled` / `class` inputs the <hlm-switch>
// element re-exposes from the composed BrnSwitch brain component and listens
// for the re-emitted `checkedChange` output. BrnSwitch renders an inner
// `<button role="switch">` that carries `data-state` and projects the thumb.
@Component({
  standalone: true,
  imports: [HlmSwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-switch
    id="ds-demo-switch"
    [checked]="checked"
    [disabled]="disabled"
    [class]="cls"
    (checkedChange)="onChange($event)"
  ></hlm-switch>`,
})
class TestHost {
  checked = false;
  disabled = false;
  cls = '';
  changes: boolean[] = [];
  onChange(checked: boolean): void {
    this.changes.push(checked);
  }
}

function setup(disabled = false, cls = '', checked = false) {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.checked = checked;
  fixture.componentInstance.disabled = disabled;
  fixture.componentInstance.cls = cls;
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector(
    'button[role="switch"]',
  ) as HTMLButtonElement;
  return { fixture, host: fixture.componentInstance, button };
}

// A bare <hlm-switch> with no consumer-supplied id, to exercise the wrapper's
// own generated auto-id default (the binding always overrides brain's own).
@Component({
  standalone: true,
  imports: [HlmSwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-switch></hlm-switch>`,
})
class BareHost {}

function setupBare() {
  const fixture = TestBed.createComponent(BareHost);
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector(
    'button[role="switch"]',
  ) as HTMLButtonElement;
  return { fixture, button };
}

describe('HlmSwitch', () => {
  it('instantiates over the brain switch with role="switch"', () => {
    const { button } = setup();
    expect(button).toBeTruthy();
    expect(button.getAttribute('role')).toBe('switch');
  });

  it('starts unchecked (data-state="unchecked")', () => {
    const { button } = setup();
    expect(button.getAttribute('data-state')).toBe('unchecked');
  });

  it('toggles checked and flips data-state checked<->unchecked on click', () => {
    const { fixture, button } = setup();
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('data-state')).toBe('checked');
    expect(button.getAttribute('aria-checked')).toBe('true');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('data-state')).toBe('unchecked');
  });

  it('emits the change output on toggle', () => {
    const { fixture, host, button } = setup();
    button.click();
    fixture.detectChanges();
    expect(host.changes).toEqual([true]);
    button.click();
    fixture.detectChanges();
    expect(host.changes).toEqual([true, false]);
  });

  it('does not toggle a disabled switch on click', () => {
    const { fixture, host, button } = setup(true);
    expect(button.disabled).toBe(true);
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('data-state')).toBe('unchecked');
    expect(host.changes).toEqual([]);
  });

  it('carries grayscale + opacity-50 on the disabled track for a clear non-interactive affordance', () => {
    // Without grayscale, opacity-50 alone leaves a disabled-ON switch reading
    // as a faded green pill (the "low-confidence live switch" look).
    // `disabled:grayscale` strips the chroma so a disabled-on switch reads as a
    // flat gray pill, and `disabled:cursor-not-allowed` provides the cursor
    // confirmation.
    const { button } = setup(true);
    expect(button.classList.contains('disabled:opacity-50')).toBe(true);
    expect(button.classList.contains('disabled:grayscale')).toBe(true);
    expect(button.classList.contains('disabled:cursor-not-allowed')).toBe(true);
  });

  it('mirrors the checked state onto the projected thumb', () => {
    const { fixture, button } = setup();
    const thumb = fixture.nativeElement.querySelector(
      'brn-switch-thumb',
    ) as HTMLElement;
    expect(thumb).toBeTruthy();
    expect(thumb.getAttribute('data-state')).toBe('unchecked');
    // The thumb takes the `bg-2` raised-surface role (the donor's raw gray-50
    // primitive is banned here by the token-discipline ramp rule). The old
    // `bg-bg` collapsed into the off track in light and was near-invisible in
    // dark, so the thumb must NOT be plain `bg-bg`.
    expect(thumb.classList.contains('bg-bg-2')).toBe(true);
    expect(thumb.classList.contains('bg-bg')).toBe(false);
    expect(thumb.classList.contains('shadow-raised')).toBe(true);
    button.click();
    fixture.detectChanges();
    expect(thumb.getAttribute('data-state')).toBe('checked');
  });

  it('carries the track base classes (inline-flex, rounded-full) and toggles the track tint', () => {
    const { fixture, button } = setup();
    expect(button.classList.contains('inline-flex')).toBe(true);
    expect(button.classList.contains('rounded-full')).toBe(true);
    // The off track takes `border-strong` (gray.400 light / gray.600 dark) as a
    // FILL (not an outline) so the pill reads as a solid rocker, not an input
    // field — the quiet resting track of the design reference. The on track uses
    // `bg-ochre` (rose accent on-state, aligned with the rest of the DS
    // accent surfaces). The 2px transparent border preserves the 2px thumb
    // inset without painting an outline.
    expect(
      button.classList.contains('data-[state=unchecked]:bg-line-2'),
    ).toBe(true);
    expect(button.classList.contains('data-[state=checked]:bg-ochre')).toBe(
      true,
    );
    // Regression guard: the prior pass used `bg-success` for the on-state;
    // PVED-10593 unified the on-state with the rest of the accent surfaces.
    expect(button.classList.contains('data-[state=checked]:bg-success')).toBe(
      false,
    );
    expect(button.classList.contains('border-transparent')).toBe(true);
    // Regression guard: the heavy 2px outline pass left these classes on
    // the track. They must NOT come back — `border-input-border` on a
    // filled track would paint a 4px-feeling double pill, and the explicit
    // `data-[state=checked]:border-ochre` is redundant with the bg fill.
    expect(
      button.classList.contains('data-[state=unchecked]:border-input-border'),
    ).toBe(false);
    expect(
      button.classList.contains('data-[state=checked]:border-ochre'),
    ).toBe(false);
    expect(button.classList.contains('data-[state=unchecked]:bg-input')).toBe(
      false,
    );
    expect(fixture).toBeTruthy();
  });

  it('merges a consumer class token onto the track', () => {
    const { button } = setup(false, 'mt-2');
    expect(button.classList.contains('mt-2')).toBe(true);
    expect(button.classList.contains('inline-flex')).toBe(true);
  });

  it('reflects a programmatic checked input onto the brain button', () => {
    const { button } = setup(false, '', true);
    expect(button.getAttribute('aria-checked')).toBe('true');
    expect(button.getAttribute('data-state')).toBe('checked');
  });

  it('gives the inner button a non-empty id when none is provided', () => {
    const { button } = setupBare();
    expect(button.id).toBeTruthy();
    expect(button.id.length).toBeGreaterThan(0);
  });

  it('mints unique, well-formed auto-ids across bare instances', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmSwitch],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-switch></hlm-switch><hlm-switch></hlm-switch>`,
    })
    class TwoBareHost {}
    const fixture = TestBed.createComponent(TwoBareHost);
    fixture.detectChanges();
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        'button[role="switch"]',
      ),
    ) as HTMLButtonElement[];
    for (const b of buttons) {
      expect(b.id).toMatch(/^hlm-switch-\d+$/);
    }
    expect(buttons[0].id).not.toBe(buttons[1].id);
  });

  it('starts unchecked by default with no checked binding at all', () => {
    const { button } = setupBare();
    expect(button.getAttribute('data-state')).toBe('unchecked');
    expect(button.getAttribute('aria-checked')).toBe('false');
  });

  it('handles a change with no registered CVA callback (non-forms usage)', () => {
    const { fixture } = setupBare();
    const sw = fixture.debugElement.query(By.directive(HlmSwitch))
      .componentInstance as HlmSwitch;
    const handle = (
      sw as unknown as { handleChange(v: boolean): void }
    ).handleChange.bind(sw);
    expect(() => handle(true)).not.toThrow();
    expect(sw.checked()).toBe(true);
  });

  it('marks the control touched on blur of the inner button', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmSwitch, ReactiveFormsModule],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-switch [formControl]="ctrl"></hlm-switch>`,
    })
    class TouchHost {
      readonly ctrl = new FormControl(false);
    }
    const fixture = TestBed.createComponent(TouchHost);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    expect(host.ctrl.touched).toBe(false);
    const sw = fixture.debugElement.query(By.directive(HlmSwitch))
      .componentInstance as HlmSwitch;
    // Drive the touched path directly (brain relays its blur through this).
    (sw as unknown as { onTouched?: () => void }).onTouched?.();
    expect(host.ctrl.touched).toBe(true);
  });

  it('forwards aria-label to the inner button and nulls it on the host', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmSwitch],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-switch aria-label="Notify me"></hlm-switch>`,
    })
    class AriaHost {}
    const fixture = TestBed.createComponent(AriaHost);
    fixture.detectChanges();
    const hostEl = fixture.nativeElement.querySelector(
      'hlm-switch',
    ) as HTMLElement;
    const button = hostEl.querySelector(
      'button[role="switch"]',
    ) as HTMLButtonElement;
    expect(hostEl.getAttribute('aria-label')).toBeNull();
    expect(button.getAttribute('aria-label')).toBe('Notify me');
  });

  it('binds through a reactive FormControl (ControlValueAccessor)', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmSwitch, ReactiveFormsModule],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-switch [formControl]="ctrl"></hlm-switch>`,
    })
    class FormHost {
      readonly ctrl = new FormControl(false);
    }
    const fixture = TestBed.createComponent(FormHost);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    const button = fixture.nativeElement.querySelector(
      'button[role="switch"]',
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    expect(host.ctrl.value).toBe(true);
    host.ctrl.setValue(false);
    fixture.detectChanges();
    expect(button.getAttribute('data-state')).toBe('unchecked');
    host.ctrl.disable();
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
  });
});
