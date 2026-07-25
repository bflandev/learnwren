import { reorderVisibleColumns } from './column-order.util';

describe('reorderVisibleColumns', () => {
  it('moves a center column later, preserving pinned/hidden slots', () => {
    // full order: pinnedLeft 'p', center visible 'a','b','c', hidden 'h'
    const full = ['p', 'a', 'b', 'c', 'h'];
    const centerIds = ['a', 'b', 'c'];
    // drag 'a' (index 0) to where 'c' is (index 2)
    expect(reorderVisibleColumns(full, centerIds, 0, 2)).toEqual([
      'p',
      'b',
      'c',
      'a',
      'h',
    ]);
  });

  it('moves a center column earlier', () => {
    const full = ['a', 'b', 'c'];
    expect(reorderVisibleColumns(full, ['a', 'b', 'c'], 2, 0)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('returns a copy unchanged for equal or out-of-range indices', () => {
    const full = ['a', 'b', 'c'];
    expect(reorderVisibleColumns(full, ['a', 'b', 'c'], 1, 1)).toEqual(full);
    expect(reorderVisibleColumns(full, ['a', 'b', 'c'], -1, 2)).toEqual(full);
    expect(reorderVisibleColumns(full, ['a', 'b', 'c'], 0, 9)).toEqual(full);
  });
});
