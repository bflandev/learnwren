import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { By } from '@angular/platform-browser';
import { DataTableStateService } from '../state/data-table-state.service';
import { TitleBoxComponent } from './title-box.component';

/** Reads the chevron direction straight off the component's computed, since
 * hlm-icon/ng-icon do not reflect the icon name into the DOM. */
function chevronIcon(
  fixture: ReturnType<typeof TestBed.createComponent<Harness>>,
): string {
  const box = fixture.debugElement.query(By.directive(TitleBoxComponent))
    .componentInstance as { chevronIcon: () => string };
  return box.chevronIcon();
}

@Component({
  standalone: true,
  imports: [TitleBoxComponent],
  providers: [DataTableStateService],
  template: `<lw-title-box
    [title]="title"
    [showMenu]="showMenu"
    [viewKind]="viewKind"
    [isDirty]="isDirty"
    (rename)="log('rename')"
    (duplicate)="log('duplicate')"
    (share)="log('share')"
    (promote)="log('promote')"
    (delete)="log('delete')"
    (reset)="log('reset')"
    (saveChanges)="log('saveChanges')"
    (saveChangesAs)="log('saveChangesAs')"
  />`,
})
class Harness {
  readonly state = inject(DataTableStateService);
  title: string | undefined = 'Events';
  showMenu = false;
  viewKind: 'system' | 'mine' = 'system';
  isDirty = false;
  readonly events: string[] = [];
  log(name: string): void {
    this.events.push(name);
  }
}

function build(): {
  fixture: ReturnType<typeof TestBed.createComponent<Harness>>;
  state: DataTableStateService;
} {
  TestBed.configureTestingModule({ imports: [Harness] });
  const fixture = TestBed.createComponent(Harness);
  fixture.detectChanges();
  return { fixture, state: fixture.componentInstance.state };
}

/** Removes any overlay DOM left over from a prior menu-open test. */
function purgeOverlay(): void {
  TestBed.inject(OverlayContainer).getContainerElement().innerHTML = '';
}

describe('TitleBoxComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders the title', () => {
    const { fixture } = build();
    expect(
      fixture.nativeElement.querySelector('[data-test="controls-title"]')
        ?.textContent,
    ).toContain('Events');
  });

  it('omits the title element when title is undefined', () => {
    TestBed.configureTestingModule({ imports: [Harness] });
    const fixture = TestBed.createComponent(Harness);
    fixture.componentInstance.title = undefined;
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-test="controls-title"]'),
    ).toBeNull();
  });

  it('shows the left-pointing chevron while the left sidebar is visible', () => {
    const { fixture, state } = build();
    state.registerSidebarPresent('left');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-test="sidebar-toggle"]'),
    ).not.toBeNull();
    expect(chevronIcon(fixture)).toBe('lucideChevronLeft');
  });

  it('toggles the left sidebar and swaps the chevron on click', () => {
    const { fixture, state } = build();
    state.registerSidebarPresent('left');
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector(
      '[data-test="sidebar-toggle"]',
    ) as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();
    expect(state.sidebarVisible().left).toBe(false);
    expect(chevronIcon(fixture)).toBe('lucideChevronRight');
  });

  it('hides the chevron when no left sidebar is present', () => {
    const { fixture } = build();
    expect(
      fixture.nativeElement.querySelector('[data-test="sidebar-toggle"]'),
    ).toBeNull();
  });

  it('pads the title with the --no-toggle modifier when no sidebar toggle is present', () => {
    const { fixture } = build();
    const box = fixture.nativeElement.querySelector('.title-box') as HTMLElement;
    expect(box.classList.contains('title-box--no-toggle')).toBe(true);
  });

  it('drops the --no-toggle modifier once a left sidebar registers the toggle', () => {
    const { fixture, state } = build();
    state.registerSidebarPresent('left');
    fixture.detectChanges();
    const box = fixture.nativeElement.querySelector('.title-box') as HTMLElement;
    expect(box.classList.contains('title-box--no-toggle')).toBe(false);
  });
});

describe('TitleBoxComponent (view menu)', () => {
  afterEach(() => {
    purgeOverlay();
    TestBed.resetTestingModule();
  });

  function buildMenu(
    opts: {
      viewKind?: 'system' | 'mine';
      isDirty?: boolean;
    } = {},
  ): {
    fixture: ReturnType<typeof TestBed.createComponent<Harness>>;
    harness: Harness;
    openMenu: () => void;
    inOverlay: (sel: string) => HTMLElement | null;
  } {
    TestBed.configureTestingModule({ imports: [Harness] });
    const fixture = TestBed.createComponent(Harness);
    fixture.componentInstance.showMenu = true;
    if (opts.viewKind !== undefined)
      fixture.componentInstance.viewKind = opts.viewKind;
    if (opts.isDirty !== undefined)
      fixture.componentInstance.isDirty = opts.isDirty;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const container = TestBed.inject(OverlayContainer).getContainerElement();
    return {
      fixture,
      harness: fixture.componentInstance,
      openMenu: () => {
        (
          fixture.nativeElement.querySelector(
            '[data-test="trigger"]',
          ) as HTMLElement
        ).click();
        fixture.detectChanges();
      },
      inOverlay: (sel: string) => container.querySelector<HTMLElement>(sel),
    };
  }

  it('hides the view menu trigger by default', () => {
    const { fixture } = build();
    expect(
      fixture.nativeElement.querySelector('lw-view-menu'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-test="trigger"]'),
    ).toBeNull();
  });

  it('renders the shared view-menu trigger when showMenu is true', () => {
    TestBed.configureTestingModule({ imports: [Harness] });
    const fixture = TestBed.createComponent(Harness);
    fixture.componentInstance.showMenu = true;
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('lw-view-menu'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-test="trigger"]'),
    ).not.toBeNull();
  });

  it('opens the full 8-item matrix for a dirty owned view', () => {
    const { openMenu, inOverlay } = buildMenu({
      viewKind: 'mine',
      isDirty: true,
    });
    openMenu();
    for (const id of [
      'duplicate',
      'share',
      'save-changes-as',
      'save-changes',
      'reset',
      'rename',
      'promote',
      'delete',
    ]) {
      expect(inOverlay(`[data-test="${id}"]`)).not.toBeNull();
    }
  });

  it('shows only duplicate + share for a clean system view', () => {
    const { openMenu, inOverlay } = buildMenu({
      viewKind: 'system',
      isDirty: false,
    });
    openMenu();
    expect(inOverlay('[data-test="duplicate"]')).not.toBeNull();
    expect(inOverlay('[data-test="share"]')).not.toBeNull();
    for (const id of [
      'save-changes-as',
      'save-changes',
      'reset',
      'rename',
      'promote',
      'delete',
    ]) {
      expect(inOverlay(`[data-test="${id}"]`)).toBeNull();
    }
  });

  it.each([
    ['duplicate', 'duplicate'],
    ['share', 'share'],
    ['save-changes-as', 'saveChangesAs'],
    ['save-changes', 'saveChanges'],
    ['reset', 'reset'],
    ['rename', 'rename'],
    ['promote', 'promote'],
    ['delete', 'delete'],
  ] as const)('re-emits %s from the view menu', (id, emitted) => {
    const { openMenu, inOverlay, harness } = buildMenu({
      viewKind: 'mine',
      isDirty: true,
    });
    openMenu();
    inOverlay(`[data-test="${id}"]`)!.click();
    expect(harness.events).toContain(emitted);
  });

  it('renders the dirty dot when isDirty is true', () => {
    TestBed.configureTestingModule({ imports: [Harness] });
    const fixture = TestBed.createComponent(Harness);
    fixture.componentInstance.showMenu = true;
    fixture.componentInstance.isDirty = true;
    fixture.detectChanges();
    const dot = fixture.nativeElement.querySelector(
      '[data-test="dirty-dot"]',
    ) as HTMLElement | null;
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute('aria-label')).toBe('Unsaved changes');
  });

  it('omits the dirty dot when isDirty is false', () => {
    TestBed.configureTestingModule({ imports: [Harness] });
    const fixture = TestBed.createComponent(Harness);
    fixture.componentInstance.showMenu = true;
    fixture.componentInstance.isDirty = false;
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-test="dirty-dot"]'),
    ).toBeNull();
  });

  it('flags the menu wrap dirty so it stays visible without hover', () => {
    TestBed.configureTestingModule({ imports: [Harness] });
    const fixture = TestBed.createComponent(Harness);
    fixture.componentInstance.showMenu = true;
    fixture.componentInstance.isDirty = true;
    fixture.detectChanges();
    const wrap = fixture.nativeElement.querySelector(
      '.title-box__menu-wrap',
    ) as HTMLElement | null;
    expect(wrap?.classList.contains('title-box__menu-wrap--dirty')).toBe(true);
  });
});
