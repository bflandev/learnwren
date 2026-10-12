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

  it('guards every out-of-range index independently', () => {
    const full = ['a', 'b', 'c'];
    // A negative previousIndex would otherwise splice from the array end.
    expect(reorderVisibleColumns(full, full, -1, 0)).toEqual(full);
    // A negative currentIndex would otherwise insert before the last slot.
    expect(reorderVisibleColumns(full, full, 0, -1)).toEqual(full);
    // currentIndex === length would otherwise append at the end.
    expect(reorderVisibleColumns(full, full, 0, 3)).toEqual(full);
    // previousIndex === length would otherwise splice nothing and insert undefined.
    expect(reorderVisibleColumns(full, full, 3, 1)).toEqual(full);
  });

  it('keeps a repeated center id in place instead of writing undefined', () => {
    // Arrange — a corrupt full order lists center id 'a' twice.
    const full = ['a', 'b', 'a'];
    // Act
    const out = reorderVisibleColumns(full, ['a', 'b'], 0, 1);
    // Assert — the two reordered ids fill the first two center slots; the
    // surplus slot falls back to its own id.
    expect(out).toEqual(['b', 'a', 'a']);
  });

  it('does not mutate its inputs and returns a fresh array', () => {
    const full = ['a', 'b', 'c'];
    const center = ['a', 'b', 'c'];
    const out = reorderVisibleColumns(full, center, 0, 1);
    expect(out).toEqual(['b', 'a', 'c']);
    expect(full).toEqual(['a', 'b', 'c']);
    expect(center).toEqual(['a', 'b', 'c']);
    expect(out).not.toBe(full);
  });
});
