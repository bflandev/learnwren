import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, NgControl, ReactiveFormsModule } from '@angular/forms';
import { HlmAutosize } from './hlm-autosize.directive';

// jsdom reports scrollHeight as 0, so this asserts the directive's contract
// (overflow/resize pinned, height driven to a px value) rather than a concrete
// pixel height.
@Component({
  standalone: true,
  imports: [HlmAutosize],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<textarea hlmAutosize>seed</textarea>`,
})
class TestHost {}

@Component({
  standalone: true,
  imports: [HlmAutosize, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<textarea hlmAutosize [formControl]="control"></textarea>`,
})
class ControlHost {
  control = new FormControl('');
}

function setup() {
  const fixture = TestBed.createComponent(TestHost);
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector(
    'textarea',
  ) as HTMLTextAreaElement;
  return { fixture, host };
}

describe('HlmAutosize', () => {
  it('pins overflow hidden and disables manual resize', () => {
    const { host } = setup();
    expect(host.style.overflow).toBe('hidden');
    expect(host.style.resize).toBe('none');
  });

  it('drives the height to a px value on the initial render', () => {
    const { host } = setup();
    expect(host.style.height).toMatch(/px$/);
  });

  it('recomputes the height on input', () => {
    const { host } = setup();
    host.value = 'more\nlines\nhere';
    host.dispatchEvent(new Event('input'));
    expect(host.style.height).toMatch(/px$/);
  });

  it('recomputes the height on a programmatic FormControl value change', () => {
    // Arrange
    const fixture = TestBed.createComponent(ControlHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    // Poison the height so only a real re-resize can restore the derived value
    // (the initial render already left a px height behind).
    host.style.height = '999px';
    // Act
    fixture.componentInstance.control.setValue('a\nb\nc');
    fixture.detectChanges();
    // Assert — jsdom reports scrollHeight 0, so a re-run lands exactly at 0px.
    expect(host.style.height).toBe('0px');
  });

  it('resets the height to auto before measuring so the element can shrink', () => {
    // Arrange
    const { host } = setup();
    const writes: string[] = [];
    Object.defineProperty(host.style, 'height', {
      configurable: true,
      get: () => writes.at(-1) ?? '',
      set: (value: string) => {
        writes.push(String(value));
      },
    });
    // Act
    host.dispatchEvent(new Event('input'));
    // Assert — the auto reset must precede the measured px write; without it a
    // previously-set inline height would floor scrollHeight in real browsers.
    expect(writes).toEqual(['auto', '0px']);
  });

  it('tolerates an attached NgControl whose valueChanges stream is unavailable', () => {
    // Arrange — a stub NgControl with a null valueChanges (the shape the
    // AbstractControlDirective typings allow before a control attaches).
    @Component({
      standalone: true,
      imports: [HlmAutosize],
      providers: [{ provide: NgControl, useValue: { valueChanges: null } }],
      template: `<textarea hlmAutosize></textarea>`,
    })
    class NullControlHost {}
    const fixture = TestBed.createComponent(NullControlHost);
    // Act / Assert — ngAfterViewInit must skip the subscription, not crash.
    expect(() => fixture.detectChanges()).not.toThrow();
  });
});
