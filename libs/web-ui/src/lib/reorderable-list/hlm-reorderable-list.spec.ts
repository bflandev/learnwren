import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { CdkDropList } from '@angular/cdk/drag-drop';
import {
  HlmReorderableList,
  REORDERABLE_HANDLE_BASE,
  REORDERABLE_ITEM_BASE,
  REORDERABLE_PLACEHOLDER_BASE,
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

// Minimal host with NO optional bindings: pins the input defaults (left handle
// position, identity tracking, generic aria label) that the bound Host above
// can never exercise.
@Component({
  standalone: true,
  imports: [HlmReorderableListImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-reorderable-list [items]="items" (reordered)="last = $event">
      <ng-template hlmReorderableItem let-item>
        <span class="row">{{ item }}</span>
      </ng-template>
    </hlm-reorderable-list>
  `,
})
class DefaultHost {
  items = ['a', 'b', 'c'];
  last: ReorderEvent<string> | null = null;
}

@Component({
  standalone: true,
  imports: [HlmReorderableListImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-reorderable-list
      [items]="items"
      [itemLabel]="label"
      (reordered)="last = $event"
    >
      <ng-template hlmReorderableItem let-item>
        <span class="row">{{ item }}</span>
      </ng-template>
    </hlm-reorderable-list>
  `,
})
class LabelHost {
  items = ['a', 'b', 'c'];
  last: ReorderEvent<string> | null = null;
  label = (item: string) => item;
}

describe('HlmReorderableList defaults and internals', () => {
  it('pins the exported base class strings (token contract)', () => {
    expect(REORDERABLE_ITEM_BASE).toBe(
      'flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/40',
    );
    expect(REORDERABLE_HANDLE_BASE).toBe(
      'inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-accent hover:text-ink focus-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50',
    );
    expect(REORDERABLE_PLACEHOLDER_BASE).toBe(
      'h-9 rounded-md border border-dashed border-line bg-bg-3/40',
    );
  });

  it('defaults handlePosition to left: a handle renders before the content', () => {
    const f = TestBed.createComponent(DefaultHost);
    f.detectChanges();
    const li = f.nativeElement.querySelector('li') as HTMLElement;
    const handle = li.querySelector('[cdkDragHandle]') as HTMLElement;
    const row = li.querySelector('.row') as HTMLElement;
    expect(handle).not.toBeNull();
    expect(
      handle.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Handle modes never mark the row itself as the draggable control.
    expect(li.getAttribute('aria-roledescription')).toBeNull();
    expect(li.className).not.toContain('select-none');
    expect(li.className).not.toContain('cursor-grab');
  });

  it('uses the generic handle aria-label without an itemLabel fn', () => {
    const f = TestBed.createComponent(DefaultHost);
    f.detectChanges();
    const handle = f.nativeElement.querySelector(
      '[cdkDragHandle]',
    ) as HTMLElement;
    expect(handle.getAttribute('aria-label')).toBe('Drag to reorder');
  });

  it('labels the handle "Reorder <label>" when itemLabel is provided', () => {
    const f = TestBed.createComponent(LabelHost);
    f.detectChanges();
    const handle = f.nativeElement.querySelector(
      '[cdkDragHandle]',
    ) as HTMLElement;
    expect(handle.getAttribute('aria-label')).toBe('Reorder a');
  });

  it('tracks by identity (item, then index for nullish items) without trackBy', () => {
    const f = TestBed.createComponent(DefaultHost);
    f.detectChanges();
    const cmp = f.debugElement.query(By.directive(HlmReorderableList))
      .componentInstance as {
      trackKey: (item: unknown, index: number) => unknown;
    };
    expect(cmp.trackKey('a', 0)).toBe('a');
    expect(cmp.trackKey(null, 2)).toBe(2);
  });

  it('drops the draggable row affordance when item mode is disabled', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.handlePosition = 'item';
    f.componentInstance.disabled = true;
    f.detectChanges();
    const li = f.nativeElement.querySelector('li') as HTMLElement;
    expect(li.className).not.toContain('select-none');
    expect(li.className).not.toContain('cursor-grab');
  });

  it('left mode: a press on an interactive control still reaches the drag root', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const li = f.nativeElement.querySelector('li') as HTMLElement;
    let reachedRoot = false;
    li.addEventListener('mousedown', () => (reachedRoot = true));
    const control = li.querySelector('.ctrl') as HTMLElement;
    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    // Only item mode suppresses the press; handle modes leave it alone.
    expect(reachedRoot).toBe(true);
  });

  it('left mode: a keydown targeting the row itself never reorders', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const li = f.nativeElement.querySelector('li') as HTMLElement;
    li.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    expect(f.componentInstance.last).toBeNull();
  });

  it('tolerates events with a null target in the item-mode guards', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.handlePosition = 'item';
    f.detectChanges();
    const cmp = f.debugElement.query(By.directive(HlmReorderableList))
      .componentInstance as {
      onRowKeydown: (e: unknown, i: number) => void;
      onContentPointerDown: (e: unknown) => void;
    };
    expect(() =>
      cmp.onRowKeydown({ target: null, key: 'Enter' }, 0),
    ).not.toThrow();
    expect(() => cmp.onContentPointerDown({ target: null })).not.toThrow();
    expect(f.componentInstance.last).toBeNull();
  });
});

describe('HlmReorderableList keyboard bounds and announcements', () => {
  function handleEls(f: { nativeElement: HTMLElement }): HTMLButtonElement[] {
    return Array.from(
      f.nativeElement.querySelectorAll('[cdkDragHandle]'),
    ) as HTMLButtonElement[];
  }

  it('ArrowUp on a middle handle moves the item up', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    handleEls(f)[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp' }),
    );
    expect(f.componentInstance.last).toEqual({
      previousIndex: 1,
      currentIndex: 0,
      items: ['b', 'a', 'c'],
    });
  });

  it('ignores non-arrow keys entirely (no move, no preventDefault)', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      cancelable: true,
    });
    handleEls(f)[1].dispatchEvent(event);
    expect(f.componentInstance.last).toBeNull();
    expect(event.defaultPrevented).toBe(false);
  });

  it('clamps at the top without consuming the key', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      cancelable: true,
    });
    handleEls(f)[0].dispatchEvent(event);
    expect(f.componentInstance.last).toBeNull();
    expect(event.defaultPrevented).toBe(false);
  });

  it('clamps at the bottom without consuming the key', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      cancelable: true,
    });
    handleEls(f)[2].dispatchEvent(event);
    expect(f.componentInstance.last).toBeNull();
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not consume arrow keys while disabled', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.disabled = true;
    f.detectChanges();
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      cancelable: true,
    });
    handleEls(f)[0].dispatchEvent(event);
    expect(f.componentInstance.last).toBeNull();
    expect(event.defaultPrevented).toBe(false);
  });

  it('announces the move with the item label and 1-based position', () => {
    const f = TestBed.createComponent(LabelHost);
    f.detectChanges();
    const announcer = TestBed.inject(LiveAnnouncer);
    const announce = vi
      .spyOn(announcer, 'announce')
      .mockResolvedValue(undefined);
    handleEls(f)[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown' }),
    );
    expect(announce).toHaveBeenCalledWith('a moved to position 2 of 3');
  });

  it('announces with the generic "Item" label when no itemLabel is set', () => {
    const f = TestBed.createComponent(DefaultHost);
    f.detectChanges();
    const announcer = TestBed.inject(LiveAnnouncer);
    const announce = vi
      .spyOn(announcer, 'announce')
      .mockResolvedValue(undefined);
    handleEls(f)[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown' }),
    );
    expect(announce).toHaveBeenCalledWith('Item moved to position 2 of 3');
  });

  it('refocuses the handle at the target index after a keyboard move', async () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const handles = handleEls(f);
    handles[0].focus();
    handles[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown' }),
    );
    f.detectChanges();
    await f.whenStable();
    expect(document.activeElement).toBe(handleEls(f)[1]);
  });

  it('refocuses the row at the target index after a keyboard move in item mode', async () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.handlePosition = 'item';
    f.detectChanges();
    const rows = Array.from(
      f.nativeElement.querySelectorAll('li'),
    ) as HTMLElement[];
    rows[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    f.detectChanges();
    await f.whenStable();
    const rowsAfter = Array.from(
      f.nativeElement.querySelectorAll('li'),
    ) as HTMLElement[];
    expect(document.activeElement).toBe(rowsAfter[1]);
  });
});

describe('HlmReorderableList move() bounds (drop path)', () => {
  function listCmp(f: ReturnType<typeof TestBed.createComponent>) {
    return f.debugElement.query(By.directive(HlmReorderableList))
      .componentInstance as {
      onDrop: (e: { previousIndex: number; currentIndex: number }) => void;
    };
  }

  it('ignores a drop onto the same index (no spurious emit)', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    listCmp(f).onDrop({ previousIndex: 0, currentIndex: 0 });
    expect(f.componentInstance.last).toBeNull();
  });

  it('ignores a drop while disabled', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.disabled = true;
    f.detectChanges();
    listCmp(f).onDrop({ previousIndex: 0, currentIndex: 1 });
    expect(f.componentInstance.last).toBeNull();
  });

  it('ignores negative and past-the-end indices instead of splicing holes', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const cmp = listCmp(f);
    cmp.onDrop({ previousIndex: -1, currentIndex: 1 });
    cmp.onDrop({ previousIndex: 0, currentIndex: -1 });
    cmp.onDrop({ previousIndex: 0, currentIndex: 3 });
    expect(f.componentInstance.last).toBeNull();
  });

  it('accepts the boundary drop onto index 0', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    listCmp(f).onDrop({ previousIndex: 1, currentIndex: 0 });
    expect(f.componentInstance.last).toEqual({
      previousIndex: 1,
      currentIndex: 0,
      items: ['b', 'a', 'c'],
    });
  });
});
