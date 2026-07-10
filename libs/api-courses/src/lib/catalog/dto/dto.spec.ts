import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CatalogQueryDto } from './catalog-query.dto';
import { CatalogSearchDto } from './catalog-search.dto';

describe('CatalogQueryDto', () => {
  it('accepts an empty query (all fields optional)', () => {
    const dto = plainToInstance(CatalogQueryDto, {});
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('coerces the page string to a number', () => {
    const dto = plainToInstance(CatalogQueryDto, { page: '3' });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.page).toBe(3);
  });

  it('rejects page below 1', () => {
    const dto = plainToInstance(CatalogQueryDto, { page: '0' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects an unknown sort value', () => {
    const dto = plainToInstance(CatalogQueryDto, { sort: 'TRENDING' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('accepts any string category — an unknown id just matches no courses (US-08-02)', () => {
    const dto = plainToInstance(CatalogQueryDto, { category: 'COOKING' });
    expect(validateSync(dto)).toEqual([]);
  });
});

describe('CatalogSearchDto', () => {
  it('accepts a non-empty query', () => {
    const dto = plainToInstance(CatalogSearchDto, { q: 'typescript' });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a missing query', () => {
    const dto = plainToInstance(CatalogSearchDto, {});
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects an empty query', () => {
    const dto = plainToInstance(CatalogSearchDto, { q: '' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects a whitespace-only query', () => {
    const dto = plainToInstance(CatalogSearchDto, { q: '   ' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('coerces the page string to a number', () => {
    const dto = plainToInstance(CatalogSearchDto, { q: 'rust', page: '2' });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.page).toBe(2);
  });

  it('rejects q over 100 characters', () => {
    const dto = plainToInstance(CatalogSearchDto, { q: 'a'.repeat(101) });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
