import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LIST_DIVIDED, LIST_ITEM_BASE } from './hlm-list.directive';
import { HlmListImports } from './index';

@Component({
  standalone: true,
  imports: [HlmListImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul hlmList [divided]="divided()" class="custom-list">
      @for (item of items; track item) {
        <li hlmListItem class="custom-row">
          <span class="label">{{ item }}</span>
        </li>
      }
    </ul>
  `,
})
class Host {
  items = ['a', 'b', 'c'];
  readonly divided = signal(false);
}

describe('HlmList', () => {
  function setup() {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const list = f.nativeElement.querySelector('ul') as HTMLElement;
    const rows = Array.from(
      f.nativeElement.querySelectorAll('li'),
    ) as HTMLElement[];
    return { f, list, rows };
  }

  it('renders one semantic list item per input and projects row content', () => {
    const { list, rows } = setup();
    expect(rows.length).toBe(3);
    expect(rows[0].querySelector('.label')?.textContent?.trim()).toBe('a');
    // a11y: role="list" survives the list-none marker removal (Safari/VO fix).
    expect(list.getAttribute('role')).toBe('list');
  });

  it('applies the compact item base to each row', () => {
    const { rows } = setup();
    for (const cls of LIST_ITEM_BASE.split(' ')) {
      expect(rows[0].classList.contains(cls)).toBe(true);
    }
  });

  it('adds the divider classes only when [divided] is set', () => {
    const { f, list } = setup();
    const dividerClasses = LIST_DIVIDED.split(' ');
    for (const cls of dividerClasses) {
      expect(list.classList.contains(cls)).toBe(false);
    }
    f.componentInstance.divided.set(true);
    f.detectChanges();
    for (const cls of dividerClasses) {
      expect(list.classList.contains(cls)).toBe(true);
    }
  });

  it('merges user classes onto the container and the row', () => {
    const { list, rows } = setup();
    expect(list.classList.contains('custom-list')).toBe(true);
    expect(list.classList.contains('flex')).toBe(true);
    expect(rows[0].classList.contains('custom-row')).toBe(true);
  });
});
