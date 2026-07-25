import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideIcons } from '@ng-icons/core';
import { HlmIcon } from './hlm-icon.component';

// Mirrors hlm-avatar.spec.ts (Vitest globals + jsdom). A consumer glyph is
// registered via @ng-icons/core's provideIcons so the hosted NgIcon resolves.
const TEST_GLYPH =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';

@Component({
  standalone: true,
  imports: [HlmIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-icon [name]="name" />`,
})
class TestHost {
  name = 'testGlyph';
}

function setup() {
  TestBed.configureTestingModule({
    providers: [provideIcons({ testGlyph: TEST_GLYPH })],
  });
  const fixture = TestBed.createComponent(TestHost);
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector('hlm-icon') as HTMLElement;
  return { fixture, host };
}

describe('HlmIcon', () => {
  it('renders an <ng-icon> for the given name with a resolved <svg>', () => {
    const { host } = setup();
    const ngIcon = host.querySelector('ng-icon');
    expect(ngIcon).not.toBeNull();
    // NgIcon injects the resolved glyph as inline SVG.
    expect(ngIcon?.querySelector('svg')).not.toBeNull();
  });

  it('pins the hosted ng-icon glyph to fill the host box', () => {
    const { host } = setup();
    const ngIcon = host.querySelector('ng-icon') as HTMLElement;
    // NgIcon's host CSS sizes its glyph from var(--ng-icon__size, 1em). Pinning
    // it to 100% makes the glyph fill the <hlm-icon> content box, so the host's
    // Tailwind size-N (not the inherited font-size) is what scales the glyph.
    expect(ngIcon.style.getPropertyValue('--ng-icon__size')).toBe('100%');
  });

  it('carries the cn() base box classes on the host', () => {
    const { host } = setup();
    expect(host.classList.contains('inline-flex')).toBe(true);
    expect(host.classList.contains('shrink-0')).toBe(true);
    expect(host.classList.contains('size-4')).toBe(true);
  });

  it('lets a consumer class resize the box while the glyph still fills it', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmIcon],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-icon name="testGlyph" class="size-6" />`,
    })
    class ClassHost {}
    TestBed.configureTestingModule({
      providers: [provideIcons({ testGlyph: TEST_GLYPH })],
    });
    const fixture = TestBed.createComponent(ClassHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('hlm-icon') as HTMLElement;
    // cn()/twMerge collapses the conflicting size utility to the consumer's on
    // the host box; the glyph fills that box via --ng-icon__size: 100%, so the
    // consumer's size-6 is what actually scales the rendered glyph.
    expect(host.classList.contains('size-6')).toBe(true);
    expect(host.classList.contains('size-4')).toBe(false);
    const ngIcon = host.querySelector('ng-icon') as HTMLElement;
    expect(ngIcon.style.getPropertyValue('--ng-icon__size')).toBe('100%');
  });
});
