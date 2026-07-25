import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HlmAvatar } from './hlm-avatar.component';

// Mirrors the lib's cn.spec.ts style (Vitest globals + jsdom). A small host
// drives the signal inputs and projects the fallback content.
@Component({
  standalone: true,
  imports: [HlmAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-avatar [src]="src" [alt]="alt"
    ><span class="fallback">JD</span></hlm-avatar
  >`,
})
class TestHost {
  src?: string;
  alt = '';
}

function setup() {
  const fixture = TestBed.createComponent(TestHost);
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector('hlm-avatar') as HTMLElement;
  return { fixture, host };
}

describe('HlmAvatar', () => {
  it('projects the <ng-content> fallback when no src is set', () => {
    const { host } = setup();
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('.fallback')?.textContent?.trim()).toBe('JD');
  });

  it('renders an <img> with the correct src/alt when src is set', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.componentInstance.src = 'https://example.test/jane.png';
    fixture.componentInstance.alt = 'Jane Doe';
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      'hlm-avatar',
    ) as HTMLElement;
    const img = host.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.test/jane.png');
    expect(img?.getAttribute('alt')).toBe('Jane Doe');
    expect(host.querySelector('.fallback')).toBeNull();
  });

  it('falls back to the projected <ng-content> when the <img> emits an error', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.componentInstance.src = 'https://example.test/broken.png';
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      'hlm-avatar',
    ) as HTMLElement;
    const img = host.querySelector('img');
    expect(img).not.toBeNull();

    img?.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('.fallback')?.textContent?.trim()).toBe('JD');
  });

  // The imageFailed linkedSignal resets (→ false) whenever its `source` (`src`)
  // changes, so supplying a fresh src after a failure re-renders the <img>.
  // This guards that reset path. A signal-driven host is used so the src
  // input change reliably propagates between change-detection cycles.
  it('clears the failed state and re-renders the <img> when a new src is supplied', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmAvatar],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-avatar [src]="src()"
        ><span class="fallback">JD</span></hlm-avatar
      >`,
    })
    class SrcHost {
      readonly src = signal<string | undefined>(
        'https://example.test/broken.png',
      );
    }
    const fixture = TestBed.createComponent(SrcHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      'hlm-avatar',
    ) as HTMLElement;
    host.querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(host.querySelector('img')).toBeNull();

    fixture.componentInstance.src.set('https://example.test/fresh.png');
    fixture.detectChanges();
    const img = host.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.test/fresh.png');
    expect(host.querySelector('.fallback')).toBeNull();
  });

  it('carries the cn() base classes on the host (shape, surface, fallback text)', () => {
    const { host } = setup();
    // Every avatar is circular, including the default `base` size.
    expect(host.classList.contains('rounded-full')).toBe(true);
    expect(host.classList.contains('bg-bg-3')).toBe(true);
    expect(host.classList.contains('text-ink-3')).toBe(true);
    // PVED-10548: the ring-1 ring-border rim was a contrast crutch for the
    // near-identical light muted/surface tones. With --lw-bg-3 pushed to a
    // ~4% L step off --lw-bg-2 (the gray.150 hover/muted tone), the bare
    // bg-bg-3 fallback reads as a placeholder on its own — the rim is gone.
    // The muted/surface gap is locked by design-system contrast.spec's
    // 'surface separation' suite.
    expect(host.classList.contains('ring-1')).toBe(false);
    expect(host.classList.contains('ring-border')).toBe(false);
    // The hover lift (shared `ds-hover-lift` DS @utility) is opt-in (PVED-10656)
    // — absent by default; a surface adds [hoverLift]="true" to enable it.
    expect(host.classList.contains('ds-hover-lift')).toBe(false);
  });

  it('omits the ds-hover-lift utility when [hoverLift] is false', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmAvatar],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-avatar [hoverLift]="false"></hlm-avatar>`,
    })
    class NoLiftHost {}
    const fixture = TestBed.createComponent(NoLiftHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      'hlm-avatar',
    ) as HTMLElement;
    expect(host.classList.contains('ds-hover-lift')).toBe(false);
  });

  it('adds the ds-hover-lift utility when [hoverLift] is true (opt-in)', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmAvatar],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-avatar [hoverLift]="true"></hlm-avatar>`,
    })
    class LiftHost {}
    const fixture = TestBed.createComponent(LiftHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      'hlm-avatar',
    ) as HTMLElement;
    expect(host.classList.contains('ds-hover-lift')).toBe(true);
  });

  it('merges a consumer class input with the base classes', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmAvatar],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-avatar class="size-12"></hlm-avatar>`,
    })
    class ClassHost {}
    const fixture = TestBed.createComponent(ClassHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      'hlm-avatar',
    ) as HTMLElement;
    // cn()/twMerge collapses the conflicting size utility to the consumer's;
    // the base size's rounded-full circular shape is preserved.
    expect(host.classList.contains('size-12')).toBe(true);
    expect(host.classList.contains('size-9')).toBe(false);
    expect(host.classList.contains('rounded-full')).toBe(true);
  });

  it('applies the default base size (size-9) when no size is set', () => {
    const { host } = setup();
    expect(host.classList.contains('size-9')).toBe(true);
  });

  it('applies size-8 for size="sm" and size-12 for size="lg"', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmAvatar],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-avatar size="sm"></hlm-avatar
        ><hlm-avatar size="lg"></hlm-avatar>`,
    })
    class SizeHost {}
    const fixture = TestBed.createComponent(SizeHost);
    fixture.detectChanges();
    const [sm, lg] = Array.from(
      fixture.nativeElement.querySelectorAll('hlm-avatar'),
    ) as HTMLElement[];
    expect(sm.classList.contains('size-8')).toBe(true);
    expect(lg.classList.contains('size-12')).toBe(true);
    // Every size is circular, regardless of scale.
    expect(sm.classList.contains('rounded-full')).toBe(true);
    expect(lg.classList.contains('rounded-full')).toBe(true);
  });

  // GUARDRAIL: cva's defaultVariants only fills FALSY props, so the component
  // normalises an unknown/garbage size to `undefined` before cva sees it — the
  // avatar still renders the base size, not an unsized element.
  it('falls back to the base size for an unknown/garbage size', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmAvatar],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-avatar [size]="$any(bad)"></hlm-avatar>`,
    })
    class BadHost {
      bad: unknown = 'huge';
    }
    const fixture = TestBed.createComponent(BadHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      'hlm-avatar',
    ) as HTMLElement;
    expect(host.classList.contains('size-9')).toBe(true);
  });
});
