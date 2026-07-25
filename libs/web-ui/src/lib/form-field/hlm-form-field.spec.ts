import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  HlmFormField,
  HlmFormFieldControl,
  HlmFormFieldError,
  HlmFormFieldHint,
} from './hlm-form-field.component';

// Mirrors the lib's other specs (Vitest globals + jsdom). One host exercises the
// container plus both message directives.
@Component({
  standalone: true,
  imports: [HlmFormField, HlmFormFieldHint, HlmFormFieldError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-form-field [class]="cls">
      <p hlmFormFieldHint>Hint text</p>
      <p hlmFormFieldError>Error text</p>
    </hlm-form-field>
  `,
})
class TestHost {
  cls = '';
}

function setup(cls = '') {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.cls = cls;
  fixture.detectChanges();
  const field = fixture.nativeElement.querySelector(
    'hlm-form-field',
  ) as HTMLElement;
  const hint = fixture.nativeElement.querySelector(
    '[hlmFormFieldHint]',
  ) as HTMLElement;
  const error = fixture.nativeElement.querySelector(
    '[hlmFormFieldError]',
  ) as HTMLElement;
  return { fixture, field, hint, error };
}

// A control wired with hlmFormFieldControl alongside a conditionally-rendered
// hint and error (both relying on the directive's generated ids), to assert the
// automated aria-describedby association.
@Component({
  standalone: true,
  imports: [
    HlmFormField,
    HlmFormFieldControl,
    HlmFormFieldHint,
    HlmFormFieldError,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-form-field>
      <input hlmFormFieldControl [aria-describedby]="own()" />
      @if (showHint()) {
        <span hlmFormFieldHint>Hint text</span>
      }
      @if (showError()) {
        <span hlmFormFieldError>Error text</span>
      }
    </hlm-form-field>
  `,
})
class WiredHost {
  readonly showHint = signal(true);
  readonly showError = signal(false);
  readonly own = signal<string | null>(null);
}

// Mirrors a consumer who supplies their own hint id (the directive must honour it
// rather than mint a generated one).
@Component({
  standalone: true,
  imports: [HlmFormField, HlmFormFieldControl, HlmFormFieldHint],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-form-field>
      <input hlmFormFieldControl />
      <span hlmFormFieldHint id="custom-hint">Hint text</span>
    </hlm-form-field>
  `,
})
class StaticIdHost {}

function setupWired() {
  const fixture = TestBed.createComponent(WiredHost);
  fixture.detectChanges();
  const control = fixture.nativeElement.querySelector(
    '[hlmFormFieldControl]',
  ) as HTMLElement;
  const hintId = () =>
    (control.parentElement?.querySelector('[hlmFormFieldHint]') as HTMLElement)
      ?.id ?? null;
  const errorId = () =>
    (control.parentElement?.querySelector('[hlmFormFieldError]') as HTMLElement)
      ?.id ?? null;
  return { fixture, host: fixture.componentInstance, control, hintId, errorId };
}

describe('HlmFormField', () => {
  it('stacks its content with the DS form-field gap', () => {
    const { field } = setup();
    expect(field.classList.contains('flex')).toBe(true);
    expect(field.classList.contains('flex-col')).toBe(true);
    expect(field.classList.contains('gap-form-field-gap')).toBe(true);
  });

  it('exposes the container as a group for assistive tech (role=group)', () => {
    const { field } = setup();
    expect(field.getAttribute('role')).toBe('group');
  });

  it('merges a consumer class token onto the container', () => {
    const { field } = setup('mt-4');
    expect(field.classList.contains('mt-4')).toBe(true);
    expect(field.classList.contains('flex-col')).toBe(true);
  });

  it('styles the hint as muted helper text', () => {
    const { hint } = setup();
    expect(hint.classList.contains('text-helper')).toBe(true);
    expect(hint.classList.contains('text-ink-3')).toBe(true);
  });

  it('styles the error as destructive helper text and announces it (role=alert)', () => {
    const { error } = setup();
    expect(error.classList.contains('text-helper')).toBe(true);
    expect(error.classList.contains('text-bad')).toBe(true);
    expect(error.getAttribute('role')).toBe('alert');
  });

  it('mints a stable id on a hint with no author id', () => {
    const { hint } = setup();
    expect(hint.id).toMatch(/^hlm-form-field-hint-\d+$/);
  });
});

describe('HlmFormFieldControl (automated aria-describedby)', () => {
  it('points the control at the registered hint id', () => {
    const { control } = setupWired();
    const hint = control.parentElement?.querySelector(
      '[hlmFormFieldHint]',
    ) as HTMLElement;
    expect(control.getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('respects a consumer-supplied hint id', () => {
    const fixture = TestBed.createComponent(StaticIdHost);
    fixture.detectChanges();
    const control = fixture.nativeElement.querySelector(
      '[hlmFormFieldControl]',
    ) as HTMLElement;
    expect(control.getAttribute('aria-describedby')).toBe('custom-hint');
  });

  it('lists the hint before the error when both are present', () => {
    const { fixture, host, control, hintId, errorId } = setupWired();
    host.showError.set(true);
    fixture.detectChanges();
    expect(control.getAttribute('aria-describedby')).toBe(
      `${hintId()} ${errorId()}`,
    );
  });

  it('drops a removed error from aria-describedby', () => {
    const { fixture, host, control, hintId } = setupWired();
    host.showError.set(true);
    fixture.detectChanges();
    host.showError.set(false);
    fixture.detectChanges();
    expect(control.getAttribute('aria-describedby')).toBe(hintId());
  });

  it('clears the attribute when nothing is registered', () => {
    const { fixture, host, control } = setupWired();
    host.showHint.set(false);
    fixture.detectChanges();
    expect(control.getAttribute('aria-describedby')).toBeNull();
  });

  it('merges an author-supplied aria-describedby ahead of the field ids', () => {
    const { fixture, host, control, hintId } = setupWired();
    host.own.set('external-note');
    fixture.detectChanges();
    expect(control.getAttribute('aria-describedby')).toBe(
      `external-note ${hintId()}`,
    );
  });
});
