import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

export type LwIconName =
  | 'search' | 'bell' | 'play' | 'pause' | 'check' | 'lock' | 'bookmark'
  | 'arrow' | 'chev-r' | 'chev-d' | 'filter' | 'grid' | 'list' | 'clock'
  | 'users' | 'level' | 'doc' | 'down' | 'captions' | 'settings' | 'fs'
  | 'vol' | 'more' | 'leaf' | 'x' | 'sun' | 'moon';

const ICON_PATHS: Record<LwIconName, string> = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 7H4c0-1 2-2 2-7z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  pause:
    '<rect x="6" y="5" width="4" height="14" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" fill="currentColor" stroke="none"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'chev-r': '<path d="m9 6 6 6-6 6"/>',
  'chev-d': '<path d="m6 9 6 6 6-6"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  grid:
    '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users:
    '<circle cx="9" cy="9" r="3"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="8" r="2.5"/><path d="M15 19c.4-2 2-4 5-4"/>',
  level: '<path d="M5 18h3v-6H5zM11 18h3V8h-3zM17 18h3V4h-3z" fill="currentColor" stroke="none"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
  down: '<path d="M12 4v12m0 0-5-5m5 5 5-5"/><path d="M5 20h14"/>',
  captions:
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 11h3M7 14h2M14 11h3M14 14h2"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19 12c0 .7-.1 1.3-.2 2l1.7 1.3-2 3.4-2-.7c-.9.7-1.9 1.3-3 1.6l-.3 2.1H10l-.3-2.1c-1.1-.3-2.1-.9-3-1.6l-2 .7-2-3.4L4.3 14c-.1-.7-.2-1.3-.2-2s.1-1.3.2-2L2.6 8.7l2-3.4 2 .7c.9-.7 1.9-1.3 3-1.6L10 1.5h4l.3 2.1c1.1.3 2.1.9 3 1.6l2-.7 2 3.4L19.7 9c.1.7.2 1.3.2 2z"/>',
  fs: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  vol: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9c1 1 1 5 0 6"/>',
  more:
    '<circle cx="6" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18" cy="12" r="1.4" fill="currentColor"/>',
  leaf: '<path d="M5 19c0-9 6-14 14-14 0 8-5 14-14 14z"/><path d="M5 19l9-9"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
};

@Component({
  selector: 'lw-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg
    [attr.width]="size()"
    [attr.height]="size()"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    [attr.stroke-width]="stroke()"
    stroke-linecap="round"
    stroke-linejoin="round"
    [innerHTML]="inner()"
  ></svg>`,
})
export class LwIconComponent {
  readonly name = input.required<LwIconName>();
  readonly size = input(16);
  readonly stroke = input(1.5);

  private readonly sanitizer = inject(DomSanitizer);

  protected readonly inner = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(ICON_PATHS[this.name()] ?? ''),
  );
}
