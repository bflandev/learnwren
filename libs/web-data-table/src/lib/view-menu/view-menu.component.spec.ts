import { afterEach, describe, expect, it } from 'vitest';
import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { ViewMenuComponent } from './view-menu.component';

// The menu composes the shared `hlm-menu` (CdkMenu under the hood), so the
// panel renders into the CDK OverlayContainer rather than into the component
// host. Outside-click and Escape dismissal are CDK behaviour and covered by
// the hlm-menu spec; here we only prove the wrapper composes it and that the
// surfaced items follow the view-kind/dirty matrix. Duplicate + Share are
// always present; Save changes / Save changes as / Reset appear when dirty
// (Save changes only for `mine`); Rename + Delete appear only for `mine`.
describe('ViewMenuComponent', () => {
  let overlayContainer: OverlayContainer;
  let containerEl: HTMLElement;

  function setup(
    opts: { viewKind?: 'system' | 'mine'; isDirty?: boolean } = {},
  ) {
    TestBed.configureTestingModule({ imports: [ViewMenuComponent] });
    overlayContainer = TestBed.inject(OverlayContainer);
    containerEl = overlayContainer.getContainerElement();
    const fixture = TestBed.createComponent(ViewMenuComponent);
    const ref = fixture.componentRef as ComponentRef<ViewMenuComponent>;
    if (opts.viewKind !== undefined) ref.setInput('viewKind', opts.viewKind);
    if (opts.isDirty !== undefined) ref.setInput('isDirty', opts.isDirty);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const trigger = host.querySelector<HTMLElement>('[data-test="trigger"]')!;
    const inOverlay = (sel: string) =>
      containerEl.querySelector<HTMLElement>(sel);
    const open = () => {
      trigger.click();
      fixture.detectChanges();
    };
    return { fixture, host, trigger, inOverlay, open };
  }

  afterEach(() => {
    overlayContainer?.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  const ITEMS = [
    'duplicate',
    'share',
    'save-changes-as',
    'save-changes',
    'reset',
    'rename',
    'promote',
    'delete',
  ] as const;

  function present(inOverlay: (sel: string) => HTMLElement | null): string[] {
    return ITEMS.filter((name) => inOverlay(`[data-test="${name}"]`) !== null);
  }

  it('is closed initially (no menu rendered)', () => {
    const { inOverlay } = setup();
    expect(inOverlay('[data-test="menu"]')).toBeNull();
  });

  it('opens the menu when the trigger is clicked', () => {
    const { inOverlay, open } = setup();
    open();
    expect(inOverlay('[data-test="menu"]')).not.toBeNull();
  });

  it('system + not dirty: only duplicate + share', () => {
    const { inOverlay, open } = setup({ viewKind: 'system', isDirty: false });
    open();
    expect(present(inOverlay)).toEqual(['duplicate', 'share']);
  });

  it('system + dirty: duplicate, share, save-changes-as, reset', () => {
    const { inOverlay, open } = setup({ viewKind: 'system', isDirty: true });
    open();
    expect(present(inOverlay)).toEqual([
      'duplicate',
      'share',
      'save-changes-as',
      'reset',
    ]);
  });

  it('mine + not dirty: duplicate, share, rename, promote, delete', () => {
    const { inOverlay, open } = setup({ viewKind: 'mine', isDirty: false });
    open();
    expect(present(inOverlay)).toEqual([
      'duplicate',
      'share',
      'rename',
      'promote',
      'delete',
    ]);
  });

  it('mine + dirty: all eight items present', () => {
    const { inOverlay, open } = setup({ viewKind: 'mine', isDirty: true });
    open();
    expect(present(inOverlay)).toEqual([...ITEMS]);
  });

  it.each([
    ['duplicate', (c: ViewMenuComponent) => c.duplicate],
    ['share', (c: ViewMenuComponent) => c.share],
    ['save-changes-as', (c: ViewMenuComponent) => c.saveChangesAs],
    ['save-changes', (c: ViewMenuComponent) => c.saveChanges],
    ['reset', (c: ViewMenuComponent) => c.reset],
    ['rename', (c: ViewMenuComponent) => c.rename],
    ['promote', (c: ViewMenuComponent) => c.promote],
    ['delete', (c: ViewMenuComponent) => c.delete],
  ] as const)('emits %s and closes on click', (name, pick) => {
    const { fixture, inOverlay, open } = setup({
      viewKind: 'mine',
      isDirty: true,
    });
    let emitted = false;
    pick(fixture.componentInstance).subscribe(() => (emitted = true));
    open();
    inOverlay(`[data-test="${name}"]`)!.click();
    fixture.detectChanges();
    expect(emitted).toBe(true);
    expect(inOverlay('[data-test="menu"]')).toBeNull();
  });
});
