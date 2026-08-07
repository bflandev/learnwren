import { describe, expect, it } from 'vitest';

import { focusReorderButton, reorderAnnouncement } from './keyboard-reorder.util';

describe('reorderAnnouncement', () => {
  it('formats a 1-based position out of the total', () => {
    expect(reorderAnnouncement('First module', 1, 3)).toBe('First module moved to position 2 of 3');
  });

  it('formats the first position correctly (0-based newIndex 0)', () => {
    expect(reorderAnnouncement('Item', 0, 2)).toBe('Item moved to position 1 of 2');
  });
});

describe('focusReorderButton', () => {
  function row(id: string, prefix: 'module' | 'lesson', upDisabled: boolean, downDisabled: boolean): string {
    return `
      <div data-${prefix}-id="${id}">
        <button data-testid="${prefix}-move-up" ${upDisabled ? 'disabled' : ''}>up</button>
        <button data-testid="${prefix}-move-down" ${downDisabled ? 'disabled' : ''}>down</button>
      </div>
    `;
  }

  it('focuses the preferred-direction button when it is enabled', () => {
    document.body.innerHTML = row('m-1', 'module', false, false);
    focusReorderButton(document.body, 'module', 'm-1', 'down');
    expect(document.activeElement?.getAttribute('data-testid')).toBe('module-move-down');
  });

  it('falls back to the opposite direction when the preferred button is disabled', () => {
    // Moved item landed last: its own "down" button is now disabled.
    document.body.innerHTML = row('m-1', 'module', false, true);
    focusReorderButton(document.body, 'module', 'm-1', 'down');
    expect(document.activeElement?.getAttribute('data-testid')).toBe('module-move-up');
  });

  it('does nothing when no row matches the given id', () => {
    document.body.innerHTML = row('m-1', 'module', false, false);
    focusReorderButton(document.body, 'module', 'does-not-exist', 'down');
    expect(document.activeElement).toBe(document.body);
  });

  it('scopes the query to the lesson prefix so it does not cross-match a module row with the same id', () => {
    document.body.innerHTML = row('shared-id', 'module', false, false) + row('shared-id', 'lesson', false, true);
    focusReorderButton(document.body, 'lesson', 'shared-id', 'down');
    // The lesson row's own "down" is disabled, so it must fall back to the
    // LESSON row's "up" — not silently focus the module row's still-enabled
    // "down" button just because the id string matches.
    expect(document.activeElement?.getAttribute('data-testid')).toBe('lesson-move-up');
  });

  it('falls back to "down" (not "up") when the preferred direction is "up" and disabled', () => {
    // Distinguishes the real ternary (preferredDirection === 'up' ? 'down' : 'up')
    // from a mutant that always takes one branch: the 'down' fallback test
    // above alone can't tell them apart, since 'down' !== 'up' makes both the
    // real condition and a forced-false mutant land on 'up'. Only a
    // preferredDirection of 'up' exercises the true branch.
    document.body.innerHTML = row('m-1', 'module', true, false);
    focusReorderButton(document.body, 'module', 'm-1', 'up');
    expect(document.activeElement?.getAttribute('data-testid')).toBe('module-move-down');
  });

  it('does not throw when neither the preferred nor the fallback button exists', () => {
    document.body.innerHTML = '<div data-module-id="m-1"></div>';
    expect(() => focusReorderButton(document.body, 'module', 'm-1', 'down')).not.toThrow();
  });
});
