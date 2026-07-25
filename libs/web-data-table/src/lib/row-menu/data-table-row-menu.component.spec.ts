import { afterEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { DataTableRowMenuComponent } from './data-table-row-menu.component';

// Mirrors the ViewMenuComponent spec: the menu composes the shared `hlm-menu`
// (CdkMenu under the hood), so the panel renders into the CDK OverlayContainer
// rather than into the component host. Here we only prove the wrapper composes
// it — clicking `[data-test="trigger"]` projects the menu + its action items,
// and each item re-emits its corresponding output and closes the panel.
describe('DataTableRowMenuComponent', () => {
  let overlayContainer: OverlayContainer;
  let containerEl: HTMLElement;

  function setup() {
    TestBed.configureTestingModule({ imports: [DataTableRowMenuComponent] });
    overlayContainer = TestBed.inject(OverlayContainer);
    containerEl = overlayContainer.getContainerElement();
    const fixture = TestBed.createComponent(DataTableRowMenuComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const trigger = host.querySelector<HTMLElement>('[data-test="trigger"]')!;
    const inOverlay = (sel: string) =>
      containerEl.querySelector<HTMLElement>(sel);
    return { fixture, trigger, inOverlay };
  }

  afterEach(() => {
    overlayContainer?.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  it('is closed initially (no menu rendered)', () => {
    const { inOverlay } = setup();
    expect(inOverlay('[data-test="menu"]')).toBeNull();
  });

  it('opens the menu when the trigger is clicked', () => {
    const { fixture, trigger, inOverlay } = setup();
    trigger.click();
    fixture.detectChanges();
    expect(inOverlay('[data-test="menu"]')).not.toBeNull();
  });

  it('emits each action and closes on click', () => {
    const { fixture, trigger, inOverlay } = setup();
    const actions: string[] = [];
    fixture.componentInstance.duplicate.subscribe(() =>
      actions.push('duplicate'),
    );
    fixture.componentInstance.delete.subscribe(() => actions.push('delete'));

    for (const name of ['duplicate', 'delete']) {
      trigger.click();
      fixture.detectChanges();
      inOverlay(`[data-test="${name}"]`)!.click();
      fixture.detectChanges();
      expect(inOverlay('[data-test="menu"]')).toBeNull();
    }
    expect(actions).toEqual(['duplicate', 'delete']);
  });

  it('hides the Delete item when showDelete is false (Duplicate stays)', () => {
    const { fixture, trigger, inOverlay } = setup();
    fixture.componentRef.setInput('showDelete', false);
    fixture.detectChanges();
    trigger.click();
    fixture.detectChanges();
    expect(inOverlay('[data-test="delete"]')).toBeNull();
    expect(inOverlay('[data-test="duplicate"]')).not.toBeNull();
  });

  it('renders dynamic actions (with a separator) after Duplicate/Delete', () => {
    const { fixture, trigger, inOverlay } = setup();
    fixture.componentRef.setInput('actions', [
      { id: 'sync', label: 'Sync' },
      { id: 'archive', label: 'Archive' },
    ]);
    fixture.detectChanges();
    trigger.click();
    fixture.detectChanges();

    const separator = inOverlay('[data-test="row-action-separator"]');
    expect(separator).not.toBeNull();
    // Semantic (not decorative) so it resolves to role="separator" inside the
    // role="menu" panel rather than the default role="none".
    expect(separator?.getAttribute('role')).toBe('separator');
    const sync = inOverlay('[data-test="row-action-sync"]');
    const archive = inOverlay('[data-test="row-action-archive"]');
    expect(sync?.textContent?.trim()).toBe('Sync');
    expect(archive?.textContent?.trim()).toBe('Archive');
  });

  it('emits the chosen action id on click', () => {
    const { fixture, trigger, inOverlay } = setup();
    const emitted: string[] = [];
    fixture.componentInstance.action.subscribe((id) => emitted.push(id));
    fixture.componentRef.setInput('actions', [
      { id: 'sync', label: 'Sync' },
      { id: 'archive', label: 'Archive' },
    ]);
    fixture.detectChanges();

    trigger.click();
    fixture.detectChanges();
    inOverlay('[data-test="row-action-archive"]')!.click();
    fixture.detectChanges();

    expect(emitted).toEqual(['archive']);
    expect(inOverlay('[data-test="menu"]')).toBeNull();
  });

  it('renders a disabled action that does not emit', () => {
    const { fixture, trigger, inOverlay } = setup();
    const emitted: string[] = [];
    fixture.componentInstance.action.subscribe((id) => emitted.push(id));
    fixture.componentRef.setInput('actions', [
      { id: 'sync', label: 'Sync', disabled: true },
    ]);
    fixture.detectChanges();

    trigger.click();
    fixture.detectChanges();
    const item = inOverlay(
      '[data-test="row-action-sync"]',
    ) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    item.click();
    fixture.detectChanges();

    expect(emitted).toEqual([]);
  });

  it('renders no extra items or separator when actions is empty', () => {
    const { fixture, trigger, inOverlay } = setup();
    const fired: string[] = [];
    fixture.componentInstance.duplicate.subscribe(() => fired.push('dup'));
    fixture.componentInstance.delete.subscribe(() => fired.push('del'));
    // actions defaults to [].
    trigger.click();
    fixture.detectChanges();

    expect(inOverlay('[data-test="row-action-separator"]')).toBeNull();
    expect(
      containerEl.querySelector('[data-test^="row-action-"]'),
    ).toBeNull();

    inOverlay('[data-test="duplicate"]')!.click();
    fixture.detectChanges();
    trigger.click();
    fixture.detectChanges();
    inOverlay('[data-test="delete"]')!.click();
    fixture.detectChanges();
    expect(fired).toEqual(['dup', 'del']);
  });
});
