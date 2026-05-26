import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwCoverComponent } from './lw-cover.component';

describe('LwCoverComponent', () => {
  it('applies the lw-cover class and the data-tone attribute', () => {
    const fixture = TestBed.createComponent(LwCoverComponent);
    fixture.componentRef.setInput('tone', 'moss');
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.classList.contains('lw-cover')).toBe(true);
    expect(host.getAttribute('data-tone')).toBe('moss');
  });

  it('renders the glyph and label', () => {
    const fixture = TestBed.createComponent(LwCoverComponent);
    fixture.componentRef.setInput('glyph', 'W');
    fixture.componentRef.setInput('label', 'cover · c1');
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.lw-cover-glyph')!.textContent).toContain('W');
    expect(host.querySelector('.lw-cover-label')!.textContent).toContain('cover · c1');
  });

  it('omits the label element when no label is given', () => {
    const fixture = TestBed.createComponent(LwCoverComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.lw-cover-label')).toBeNull();
  });

  it('defaults the tone to "ink" when no tone input is provided', () => {
    // Pins the StringLiteral default at lw-cover.component.ts:23. A mutation
    // changing the default to '' would make this attribute empty.
    const fixture = TestBed.createComponent(LwCoverComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).getAttribute('data-tone')).toBe('ink');
  });

  it('defaults the glyph and label to the empty string', () => {
    // Pins the StringLiteral defaults for glyph and label inputs. If either
    // default changes, the rendered glyph element would change content and
    // the label conditional would render unexpectedly.
    const fixture = TestBed.createComponent(LwCoverComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.lw-cover-glyph')!.textContent).toBe('');
    expect(host.querySelector('.lw-cover-label')).toBeNull();
  });
});

describe('LwCoverComponent — image input', () => {
  it('renders an <img> with src + alt when imageUrl is set, and omits the glyph', () => {
    const fixture = TestBed.createComponent(LwCoverComponent);
    fixture.componentRef.setInput('imageUrl', 'https://cdn/x.jpg');
    fixture.componentRef.setInput('alt', 'Intro to TypeScript');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const img = host.querySelector('img.lw-cover-image') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('https://cdn/x.jpg');
    expect(img!.getAttribute('alt')).toBe('Intro to TypeScript');
    expect(img!.getAttribute('loading')).toBe('lazy');
    expect(host.querySelector('.lw-cover-glyph')).toBeNull();
  });

  it('falls back to the glyph render path when imageUrl is unset', () => {
    const fixture = TestBed.createComponent(LwCoverComponent);
    fixture.componentRef.setInput('glyph', 'W');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('img.lw-cover-image')).toBeNull();
    expect(host.querySelector('.lw-cover-glyph')!.textContent).toContain('W');
  });
});
