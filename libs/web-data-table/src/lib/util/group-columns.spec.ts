import type { DataTableColumn } from '../models';
import {
  groupColumnsByPrefix,
  titleCasePrefix,
} from './group-columns';

describe('titleCasePrefix', () => {
  it('splits camelCase into title-cased words', () => {
    expect(titleCasePrefix('localizableSet')).toBe('Localizable Set');
  });
  it('capitalizes a single lowercase token', () => {
    expect(titleCasePrefix('event')).toBe('Event');
  });
  it('handles digits and acronym boundaries gracefully', () => {
    expect(titleCasePrefix('assetV2')).toBe('Asset V2');
  });
  it('treats underscores and hyphens as word breaks', () => {
    expect(titleCasePrefix('asset_type')).toBe('Asset Type');
    expect(titleCasePrefix('asset-type')).toBe('Asset Type');
  });
});

describe('groupColumnsByPrefix', () => {
  const cols: DataTableColumn[] = [
    { id: 'localizableSet.title', header: 'Title' },
    { id: 'localizableSet.status', header: 'Status' },
    { id: 'asset.name', header: 'Asset name' },
    { id: 'name', header: 'Name' },
    { id: 'id', header: 'ID' },
  ];

  it('groups dotted ids by prefix in first-seen order', () => {
    const groups = groupColumnsByPrefix(cols);
    expect(groups.map((g) => g.key)).toEqual([
      'localizableSet',
      'asset',
      'general',
    ]);
  });

  it('title-cases each dotted-prefix label', () => {
    const groups = groupColumnsByPrefix(cols);
    expect(groups[0].label).toBe('Localizable Set');
    expect(groups[1].label).toBe('Asset');
  });

  it('collects flat ids under a trailing General group', () => {
    const groups = groupColumnsByPrefix(cols);
    const general = groups[groups.length - 1];
    expect(general).toMatchObject({ key: 'general', label: 'General' });
    expect(general.columns.map((c) => c.id)).toEqual(['name', 'id']);
  });

  it('omits the General group when every id is dotted', () => {
    const groups = groupColumnsByPrefix([
      { id: 'asset.name', header: 'Asset name' },
    ]);
    expect(groups.map((g) => g.key)).toEqual(['asset']);
  });

  it('returns an empty array for no columns', () => {
    expect(groupColumnsByPrefix([])).toEqual([]);
  });

  it('merges flat ids into an existing dotted "general" group (no duplicate keys)', () => {
    const groups = groupColumnsByPrefix([
      { id: 'general.note', header: 'Note' },
      { id: 'name', header: 'Name' },
    ]);
    expect(groups.map((g) => g.key)).toEqual(['general']);
    expect(groups[0].columns.map((c) => c.id)).toEqual([
      'general.note',
      'name',
    ]);
  });
});
