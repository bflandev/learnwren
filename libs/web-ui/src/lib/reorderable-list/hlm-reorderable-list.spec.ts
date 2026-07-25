import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CdkDropList } from '@angular/cdk/drag-drop';
import {
  HlmReorderableList,
  type HlmReorderableHandlePosition,
  type ReorderEvent,
} from './hlm-reorderable-list.component';
import { HlmReorderableListImports } from './index';

@Component({
  standalone: true,
  imports: [HlmReorderableListImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-reorderable-list
      [items]="items"
      [disabled]="disabled"
      [handlePosition]="handlePosition"
      [trackBy]="trackByValue"
      class="custom-list"
      (reordered)="last = $event"
    >
      <ng-template hlmReorderableItem let-item let-i="index">
        <span class="row" [attr.data-index]="i">{{ item }}</span>
        <label class="lbl" [attr.for]="'ctrl-' + i">{{ item }}</label>
        <button type="button" class="ctrl">toggle</button>
      </ng-template>
    </hlm-reorderable-list>
  `,
})
class Host {
  items = ['a', 'b', 'c'];
  disabled = false;
  handlePosition: HlmReorderableHandlePosition = 'left';
  last: ReorderEvent<string> | null = null;
  trackByValue = (item: string) => item;
}

function handles(f: { nativeElement: HTMLElement }): HTMLButtonElement[] {
  return Array.from(
    f.nativeElement.querySelectorAll('[cdkDragHandle]'),
  ) as HTMLButtonElement[];
}

describe('HlmReorderableList', () => {
  it('renders one draggable row per item and projects the row template', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const rows = f.nativeElement.querySelectorAll('.row');
    expect(rows.length).toBe(3);
    expect((rows[0] as HTMLElement).textContent?.trim()).toBe('a');
    expect(handles(f).length).toBe(3);
  });

  it('a drop with an out-of-range index is ignored (no corrupted emit)', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const list = f.debugElement.query(By.directive(HlmReorderableList))
      .componentInstance as { onDrop: (e: unknown) => void };
    // A list mutated mid-drag could leave CDK's index past the end; splicing it
    // would emit an array with an `undefined` hole, so move() must bail instead.
    list.onDrop({ previousIndex: 0, currentIndex: 99 });
    expect(f.componentInstance.last).toBeNull();
  });

  it('ArrowDown on a handle emits an immutable reorder moving the item down', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    handles(f)[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown' }),
    );
    expect(f.componentInstance.last).toEqual({
      previousIndex: 0,
      currentIndex: 1,
      items: ['b', 'a', 'c'],
    });
    // Parent state is untouched until it applies the event.
    expect(f.componentInstance.items).toEqual(['a', 'b', 'c']);
  });

  it('ArrowUp on the first item is a no-op (clamped at the top)', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    handles(f)[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp' }),
    );
    expect(f.componentInstance.last).toBeNull();
  });

  it('routes a CDK drop through to a reorder event', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const dropList = f.debugElement
      .query(By.directive(CdkDropList))
      .injector.get(CdkDropList);
    dropList.dropped.emit({ previousIndex: 0, currentIndex: 2 } as never);
    expect(f.componentInstance.last).toEqual({
      previousIndex: 0,
      currentIndex: 2,
      items: ['b', 'c', 'a'],
    });
  });

  it('blocks keyboard reordering while disabled', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.disabled = true;
    f.detectChanges();
    handles(f)[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown' }),
    );
    expect(f.componentInstance.last).toBeNull();
  });

  it('merges the user class onto the list container', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const list = f.nativeElement.querySelector('ul') as HTMLElement;
    expect(list.classList.contains('custom-list')).toBe(true);
    expect(list.classList.contains('flex')).toBe(true);
  });

  it('renders the handle before the row content by default (left)', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const li = f.nativeElement.querySelector('li') as HTMLElement;
    const handle = li.querySelector('[cdkDragHandle]') as HTMLElement;
    const row = li.querySelector('.row') as HTMLElement;
    expect(
      handle.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('moves the handle after the row content when handlePosition="right"', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.handlePosition = 'right';
    f.detectChanges();
    const li = f.nativeElement.querySelector('li') as HTMLElement;
    const handle = li.querySelector('[cdkDragHandle]') as HTMLElement;
    const row = li.querySelector('.row') as HTMLElement;
    expect(handles(f).length).toBe(3);
    expect(
      row.compareDocumentPosition(handle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('drops the handle and makes the whole row the drag control in item mode', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.handlePosition = 'item';
    f.detectChanges();
    expect(handles(f).length).toBe(0);
    const li = f.nativeElement.querySelector('li') as HTMLElement;
    expect(li.getAttribute('tabindex')).toBe('0');
    // The native <li> keeps its implicit listitem role (no role override), so
    // list semantics and interactive row content survive; it announces as
    // draggable via aria-roledescription instead.
    expect(li.getAttribute('role')).toBeNull();
    expect(li.getAttribute('aria-roledescription')).toBe('Draggable item');
    expect(li.getAttribute('aria-label')).toBe('Drag to reorder');
    // Suppresses the text selection a press-drag would otherwise start.
    expect(li.className).toContain('select-none');
  });

  it('reorders from the row keydown in item mode without mutating parent state', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.handlePosition = 'item';
    f.detectChanges();
    const li = f.nativeElement.querySelector('li') as HTMLElement;
    li.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    expect(f.componentInstance.last).toEqual({
      previousIndex: 0,
      currentIndex: 1,
      items: ['b', 'a', 'c'],
    });
    expect(f.componentInstance.items).toEqual(['a', 'b', 'c']);
  });

  it('blocks row-keyboard reordering in item mode while disabled', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.handlePosition = 'item';
    f.componentInstance.disabled = true;
    f.detectChanges();
    const li = f.nativeElement.querySelector('li') as HTMLElement;
    expect(li.getAttribute('tabindex')).toBeNull();
    li.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    expect(f.componentInstance.last).toBeNull();
  });

  it('item mode: a press on an interactive control never reaches the drag root', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.handlePosition = 'item';
    f.detectChanges();
    const li = f.nativeElement.querySelector('li') as HTMLElement;
    let reachedRoot = false;
    li.addEventListener('mousedown', () => (reachedRoot = true));
    const control = li.querySelector('.ctrl') as HTMLElement;
    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    // CDK's drag-start listener lives on the <li>; suppression here means no drag.
    expect(reachedRoot).toBe(false);
  });

  it('item mode: a press on a label (it actuates its control) never reaches the drag root', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.handlePosition = 'item';
    f.detectChanges();
    const li = f.nativeElement.querySelector('li') as HTMLElement;
    let reachedRoot = false;
    li.addEventListener('mousedown', () => (reachedRoot = true));
    const label = li.querySelector('.lbl') as HTMLElement;
    label.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    // A label toggles its bound control on click, so a press there must not drag.
    expect(reachedRoot).toBe(false);
  });

  it('item mode: a press on non-control row content reaches the drag root', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.handlePosition = 'item';
    f.detectChanges();
    const li = f.nativeElement.querySelector('li') as HTMLElement;
    let reachedRoot = false;
    li.addEventListener('mousedown', () => (reachedRoot = true));
    const row = li.querySelector('.row') as HTMLElement;
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(reachedRoot).toBe(true);
  });

  it('item mode: arrow keys from a focused control do not reorder', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.handlePosition = 'item';
    f.detectChanges();
    const control = f.nativeElement.querySelector('.ctrl') as HTMLElement;
    control.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    expect(f.componentInstance.last).toBeNull();
  });
});
