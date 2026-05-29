import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LwAvatarComponent, deriveInitials } from './lw-avatar.component';

function render(
  props: Partial<{
    photoUrl: string;
    displayName: string;
    userId: string;
    size: 'sm' | 'md' | 'lg';
    alt: string;
  }>,
) {
  const fixture = TestBed.createComponent(LwAvatarComponent);
  fixture.componentRef.setInput('displayName', props.displayName ?? 'Ada Lovelace');
  fixture.componentRef.setInput('userId', props.userId ?? 'u1');
  if (props.photoUrl !== undefined) fixture.componentRef.setInput('photoUrl', props.photoUrl);
  if (props.size !== undefined) fixture.componentRef.setInput('size', props.size);
  if (props.alt !== undefined) fixture.componentRef.setInput('alt', props.alt);
  fixture.detectChanges();
  return fixture;
}

describe('LwAvatarComponent', () => {
  it('renders <img> with loading=lazy when photoUrl is set', () => {
    const f = render({ photoUrl: 'https://example.com/p/u1/avatar.jpg?v=1' });
    const host: HTMLElement = f.nativeElement;
    const img = host.querySelector('img.lw-avatar-image') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute('loading')).toBe('lazy');
  });

  it('alt falls back to displayName when alt input is empty', () => {
    const f = render({ photoUrl: 'https://example.com/x.jpg', displayName: 'Ada Lovelace' });
    const host: HTMLElement = f.nativeElement;
    const img = host.querySelector('img.lw-avatar-image') as HTMLImageElement;
    expect(img.alt).toBe('Ada Lovelace');
  });

  it('uses the explicit alt input when provided', () => {
    const f = render({
      photoUrl: 'https://example.com/x.jpg',
      displayName: 'Ada Lovelace',
      alt: 'Profile photo of Ada',
    });
    const host: HTMLElement = f.nativeElement;
    const img = host.querySelector('img.lw-avatar-image') as HTMLImageElement;
    expect(img.alt).toBe('Profile photo of Ada');
  });

  it('renders initials when photoUrl is unset', () => {
    const f = render({ displayName: 'Ada Lovelace' });
    const host: HTMLElement = f.nativeElement;
    const span = host.querySelector('span.lw-avatar-initials');
    expect(span?.textContent?.trim()).toBe('AL');
    expect(host.querySelector('img.lw-avatar-image')).toBeNull();
  });

  it('single-word displayName → first two letters of that word', () => {
    const f = render({ displayName: 'Ada' });
    const host: HTMLElement = f.nativeElement;
    expect(host.querySelector('span.lw-avatar-initials')?.textContent?.trim()).toBe('AD');
  });

  it('attaches a deterministic tone data attribute keyed off userId', () => {
    const a = render({ userId: 'u1' });
    const b = render({ userId: 'u1' });
    const tone = (a.nativeElement as HTMLElement).getAttribute('data-tone');
    expect(tone).not.toBeNull();
    expect(tone).toBe((b.nativeElement as HTMLElement).getAttribute('data-tone'));
  });

  it('applies size attribute for sm/md/lg', () => {
    const sm = render({ size: 'sm' });
    expect((sm.nativeElement as HTMLElement).getAttribute('data-size')).toBe('sm');
    const lg = render({ size: 'lg' });
    expect((lg.nativeElement as HTMLElement).getAttribute('data-size')).toBe('lg');
  });

  it('defaults the size attribute to "md" when no size input is provided', () => {
    const f = render({});
    expect((f.nativeElement as HTMLElement).getAttribute('data-size')).toBe('md');
  });

  it('applies the lw-avatar host class', () => {
    const f = render({});
    expect((f.nativeElement as HTMLElement).classList.contains('lw-avatar')).toBe(true);
  });
});

describe('deriveInitials', () => {
  it('takes the first letter of the first and last word, uppercased', () => {
    expect(deriveInitials('Ada Lovelace')).toBe('AL');
    expect(deriveInitials('grace brewster murray hopper')).toBe('GH');
  });

  it('takes the first two letters for a single-word name, uppercased', () => {
    expect(deriveInitials('Madonna')).toBe('MA');
    expect(deriveInitials('x')).toBe('X');
  });

  it('trims surrounding whitespace before deriving', () => {
    // Kills the `name.trim()` → `name` mutant: without trimming, the leading
    // space makes words[0] the empty string and the initials collapse to ''.
    expect(deriveInitials('  Ada Lovelace  ')).toBe('AL');
  });

  it('returns an empty string for blank or whitespace-only input', () => {
    expect(deriveInitials('')).toBe('');
    expect(deriveInitials('   ')).toBe('');
  });
});
