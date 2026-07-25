import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { HlmTags, splitTags } from './hlm-tags.component';

describe('splitTags', () => {
  it('splits on commas and newlines, trimming and dropping empties', () => {
    expect(splitTags('a, b\nc')).toEqual(['a', 'b', 'c']);
    expect(splitTags('  spaced  ')).toEqual(['spaced']);
    expect(splitTags(' , ,\n ')).toEqual([]);
  });
});

@Component({
  standalone: true,
  imports: [HlmTags],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-tags
    [(value)]="tags"
    [max]="max"
    [disabled]="disabled"
    [inputId]="inputId"
    [ariaLabelledby]="ariaLabelledby"
    [commitOnEnter]="commitOnEnter"
    [commitOnSpace]="commitOnSpace"
    [commitOnTab]="commitOnTab"
    (removed)="removedTag = $event"
  />`,
})
class TestHost {
  tags: readonly string[] = [];
  max = 0;
  disabled = false;
  inputId = '';
  ariaLabelledby = '';
  commitOnEnter = true;
  commitOnSpace = true;
  commitOnTab = true;
  removedTag: string | null = null;
}

function setup(
  opts: {
    tags?: string[];
    max?: number;
    disabled?: boolean;
    inputId?: string;
    ariaLabelledby?: string;
    commitOnEnter?: boolean;
    commitOnSpace?: boolean;
    commitOnTab?: boolean;
  } = {},
) {
  const fixture = TestBed.createComponent(TestHost);
  const host = fixture.componentInstance;
  if (opts.tags) host.tags = opts.tags;
  if (opts.max !== undefined) host.max = opts.max;
  if (opts.disabled !== undefined) host.disabled = opts.disabled;
  if (opts.inputId !== undefined) host.inputId = opts.inputId;
  if (opts.ariaLabelledby !== undefined)
    host.ariaLabelledby = opts.ariaLabelledby;
  if (opts.commitOnEnter !== undefined) host.commitOnEnter = opts.commitOnEnter;
  if (opts.commitOnSpace !== undefined) host.commitOnSpace = opts.commitOnSpace;
  if (opts.commitOnTab !== undefined) host.commitOnTab = opts.commitOnTab;
  fixture.detectChanges();
  const input = fixture.nativeElement.querySelector(
    '[data-testid="hlm-tags-input"]',
  ) as HTMLInputElement;
  return { fixture, host, input };
}

function enter(
  input: HTMLInputElement,
  fixture: { detectChanges(): void },
  text: string,
) {
  input.value = text;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  fixture.detectChanges();
}

function paste(
  input: HTMLInputElement,
  fixture: { detectChanges(): void },
  text: string,
) {
  const event = new Event('paste') as Event & { clipboardData: unknown };
  event.clipboardData = { getData: () => text };
  input.dispatchEvent(event);
  fixture.detectChanges();
}

// Dispatches a cancelable keydown so the handler's preventDefault is observable,
// and reports whether the default was prevented (commit path swallows the key).
function press(
  input: HTMLInputElement,
  fixture: { detectChanges(): void },
  key: string,
  text: string,
  init: KeyboardEventInit = {},
): boolean {
  input.value = text;
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
  input.dispatchEvent(event);
  fixture.detectChanges();
  return event.defaultPrevented;
}

function chips(fixture: { nativeElement: HTMLElement }): string[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll('[data-testid="hlm-tag"]'),
  ).map((el) => (el.textContent ?? '').replace('×', '').trim());
}

describe('HlmTags', () => {
  it('renders the seeded chips', () => {
    const { fixture } = setup({ tags: ['alpha', 'bravo'] });
    expect(chips(fixture)).toEqual(['alpha', 'bravo']);
  });

  it('adds a trimmed chip on Enter and clears the field', () => {
    const { fixture, host, input } = setup();
    enter(input, fixture, '  charlie  ');
    expect(host.tags).toEqual(['charlie']);
    expect(input.value).toBe('');
  });

  it('adds a chip on Space and clears the field', () => {
    const { fixture, host, input } = setup();
    expect(press(input, fixture, ' ', 'charlie')).toBe(true);
    expect(host.tags).toEqual(['charlie']);
    expect(input.value).toBe('');
  });

  it('adds a chip on Tab when the field has content and keeps focus', () => {
    const { fixture, host, input } = setup();
    expect(press(input, fixture, 'Tab', 'delta')).toBe(true);
    expect(host.tags).toEqual(['delta']);
    expect(input.value).toBe('');
  });

  it('lets Tab move focus when the field is empty (no chip, default not prevented)', () => {
    const { fixture, host, input } = setup({ tags: ['alpha'] });
    expect(press(input, fixture, 'Tab', '')).toBe(false);
    expect(host.tags).toEqual(['alpha']);
  });

  it('does not commit on Shift+Tab even with content', () => {
    const { fixture, host, input } = setup();
    expect(press(input, fixture, 'Tab', 'echo', { shiftKey: true })).toBe(false);
    expect(host.tags).toEqual([]);
  });

  it('opts a key out: Enter / Space / Tab each ignored when its input is false', () => {
    const enterOff = setup({ commitOnEnter: false });
    expect(press(enterOff.input, enterOff.fixture, 'Enter', 'foo')).toBe(false);
    expect(enterOff.host.tags).toEqual([]);

    const spaceOff = setup({ commitOnSpace: false });
    expect(press(spaceOff.input, spaceOff.fixture, ' ', 'foo')).toBe(false);
    expect(spaceOff.host.tags).toEqual([]);

    const tabOff = setup({ commitOnTab: false });
    expect(press(tabOff.input, tabOff.fixture, 'Tab', 'foo')).toBe(false);
    expect(tabOff.host.tags).toEqual([]);
  });

  it('drops a whitespace-only Enter', () => {
    const { fixture, host, input } = setup();
    enter(input, fixture, '   ');
    expect(host.tags).toEqual([]);
  });

  it('rejects a case-insensitive duplicate', () => {
    const { fixture, host, input } = setup({ tags: ['alpha'] });
    enter(input, fixture, 'ALPHA');
    expect(host.tags).toEqual(['alpha']);
  });

  it('splits a CSV paste into chips, deduping within the batch and vs existing', () => {
    const { fixture, host, input } = setup({ tags: ['alpha'] });
    paste(input, fixture, 'bravo, charlie, Bravo, alpha');
    expect(host.tags).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('caps additions at the max', () => {
    const { fixture, host, input } = setup({ tags: ['a'], max: 2 });
    paste(input, fixture, 'b, c, d');
    expect(host.tags).toEqual(['a', 'b']);
  });

  it('removes a chip and emits the removed event', () => {
    const { fixture, host } = setup({ tags: ['alpha', 'bravo'] });
    const removeBtn = fixture.nativeElement.querySelector(
      '[aria-label="Remove alpha"]',
    ) as HTMLButtonElement;
    removeBtn.click();
    fixture.detectChanges();
    expect(host.tags).toEqual(['bravo']);
    expect(host.removedTag).toBe('alpha');
  });

  it('clears all chips via Clear all', () => {
    const { fixture, host } = setup({ tags: ['alpha', 'bravo'] });
    const clear = fixture.nativeElement.querySelector(
      '[data-testid="hlm-tags-clear"]',
    ) as HTMLButtonElement;
    clear.click();
    fixture.detectChanges();
    expect(host.tags).toEqual([]);
  });

  it('blocks adds when disabled', () => {
    const { fixture, host, input } = setup({ tags: ['alpha'], disabled: true });
    enter(input, fixture, 'bravo');
    expect(host.tags).toEqual(['alpha']);
    expect(input.disabled).toBe(true);
  });

  it('carries the field BASE class on the host', () => {
    const { fixture } = setup();
    const el = fixture.nativeElement.querySelector('hlm-tags');
    expect(el.classList.contains('flex-wrap')).toBe(true);
    expect(el.classList.contains('rounded-control')).toBe(true);
  });

  it('forwards inputId and ariaLabelledby onto the internal field', () => {
    const { input } = setup({
      inputId: 'topics',
      ariaLabelledby: 'topics-label',
    });
    expect(input.getAttribute('id')).toBe('topics');
    expect(input.getAttribute('aria-labelledby')).toBe('topics-label');
  });

  it('omits id and aria-labelledby when not provided', () => {
    const { input } = setup();
    expect(input.getAttribute('id')).toBeNull();
    expect(input.getAttribute('aria-labelledby')).toBeNull();
  });

  it('starts empty with a blank field on a completely unbound host', () => {
    // Arrange — nothing bound, so the model/placeholder/id defaults render.
    @Component({
      standalone: true,
      imports: [HlmTags],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-tags />`,
    })
    class BareHost {}
    // Act
    const fixture = TestBed.createComponent(BareHost);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector(
      '[data-testid="hlm-tags-input"]',
    ) as HTMLInputElement;
    // Assert — no chips, empty placeholder, no labelling attrs, field enabled.
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="hlm-tag"]').length,
    ).toBe(0);
    expect(input.placeholder).toBe('');
    expect(input.getAttribute('id')).toBeNull();
    expect(input.getAttribute('aria-labelledby')).toBeNull();
    expect(input.disabled).toBe(false);
  });

  it('disables the field exactly at the max and re-enables below it', () => {
    // At the cap (length === max) the field must lock…
    const atMax = setup({ tags: ['a', 'b'], max: 2 });
    expect(atMax.input.disabled).toBe(true);
    // …one below the cap it stays open.
    const below = setup({ tags: ['a'], max: 2 });
    expect(below.input.disabled).toBe(false);
  });

  it('lets Tab move focus when the field holds only whitespace', () => {
    const { fixture, host, input } = setup();
    expect(press(input, fixture, 'Tab', '   ')).toBe(false);
    expect(host.tags).toEqual([]);
  });

  it('requests the plain-text clipboard flavor on paste', () => {
    const { fixture, input } = setup();
    const getData = vi.fn().mockReturnValue('alpha');
    const event = new Event('paste') as Event & { clipboardData: unknown };
    event.clipboardData = { getData };
    input.dispatchEvent(event);
    fixture.detectChanges();
    expect(getData).toHaveBeenCalledWith('text');
  });

  it('ignores a paste without clipboard data instead of crashing', () => {
    const { fixture, host, input } = setup({ tags: ['alpha'] });
    // A bare paste event: clipboardData is undefined in jsdom.
    expect(() => {
      input.dispatchEvent(new Event('paste'));
      fixture.detectChanges();
    }).not.toThrow();
    expect(host.tags).toEqual(['alpha']);
  });

  it('leaves an empty-text paste to the browser (default not prevented)', () => {
    const { fixture, input } = setup();
    const event = new Event('paste', { cancelable: true }) as Event & {
      clipboardData: unknown;
    };
    event.clipboardData = { getData: () => '' };
    input.dispatchEvent(event);
    fixture.detectChanges();
    expect(event.defaultPrevented).toBe(false);
  });

  it('empties the field after a consumed paste', () => {
    const { fixture, input } = setup();
    input.value = 'bravo, charlie';
    paste(input, fixture, 'bravo, charlie');
    expect(input.value).toBe('');
  });

  it('does not rewrite the model when a commit adds nothing (duplicate)', () => {
    const { fixture, host, input } = setup({ tags: ['alpha'] });
    const before = host.tags;
    enter(input, fixture, 'ALPHA');
    // Same reference — the documented "write only on change" contract.
    expect(host.tags).toBe(before);
  });

  it('blocks a programmatic remove while disabled', () => {
    const { fixture, host } = setup({ tags: ['alpha'], disabled: true });
    const removeBtn = fixture.nativeElement.querySelector(
      '[aria-label="Remove alpha"]',
    ) as HTMLButtonElement;
    // dispatchEvent bypasses the native disabled-click suppression, so the
    // component guard is what must hold the line.
    removeBtn.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(host.tags).toEqual(['alpha']);
    expect(host.removedTag).toBeNull();
  });

  it('blocks clearAll while disabled and skips the write when already empty', () => {
    // Disabled with chips: the guard must refuse the clear.
    const disabled = setup({ tags: ['alpha'], disabled: true });
    const disabledTags = disabled.fixture.debugElement.query(
      By.directive(HlmTags),
    ).componentInstance as unknown as { clearAll(): void };
    disabledTags.clearAll();
    disabled.fixture.detectChanges();
    expect(disabled.host.tags).toEqual(['alpha']);
    // Enabled but empty: no model rewrite (same reference preserved).
    const empty = setup();
    const before = empty.host.tags;
    const emptyTags = empty.fixture.debugElement.query(By.directive(HlmTags))
      .componentInstance as unknown as { clearAll(): void };
    emptyTags.clearAll();
    empty.fixture.detectChanges();
    expect(empty.host.tags).toBe(before);
  });
});
