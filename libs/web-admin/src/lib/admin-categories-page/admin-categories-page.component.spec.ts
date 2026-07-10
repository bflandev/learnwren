import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CategoryId } from '@learnwren/shared-data-models';

import { AdminCategoriesService } from '../admin-categories.service';
import { AdminCategoriesPageComponent } from './admin-categories-page.component';

function cat(id: string, name: string) {
  return { id: id as CategoryId, name, createdAt: 'x', updatedAt: 'x' };
}

function apiError(status: number, code: string, message = 'nope') {
  return new HttpErrorResponse({ status, error: { error: { code, message } } });
}

describe('AdminCategoriesPageComponent', () => {
  let svc: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  async function setup() {
    TestBed.configureTestingModule({
      imports: [AdminCategoriesPageComponent],
      providers: [{ provide: AdminCategoriesService, useValue: svc }],
    });
    const fixture = TestBed.createComponent(AdminCategoriesPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    svc = {
      list: vi.fn(async () => [cat('BUSINESS', 'Business'), cat('DESIGN', 'Design')]),
      create: vi.fn(async () => cat('NEW', 'New')),
      rename: vi.fn(async () => cat('DESIGN', 'Design & UX')),
      delete: vi.fn(async () => ({ reassignedCourses: 0 })),
    };
  });

  it('loads and renders the category list', async () => {
    const fixture = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Business');
    expect(text).toContain('Design');
    expect(svc.list).toHaveBeenCalled();
  });

  it('shows the load-error state (a failed fetch must not read as an empty list)', async () => {
    svc.list.mockRejectedValue(new Error('down'));
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="load-error"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="category-list"]')).toBeFalsy();
  });

  it('creates a category from the trimmed input and reloads', async () => {
    const fixture = await setup();
    fixture.componentInstance.newName = '  Data Science  ';
    await fixture.componentInstance.create();
    expect(svc.create).toHaveBeenCalledWith('Data Science');
    expect(fixture.componentInstance.newName).toBe('');
    expect(svc.list).toHaveBeenCalledTimes(2);
  });

  it('ignores create with a blank name', async () => {
    const fixture = await setup();
    fixture.componentInstance.newName = '   ';
    await fixture.componentInstance.create();
    expect(svc.create).not.toHaveBeenCalled();
  });

  it('surfaces CATEGORY_EXISTS on create as a friendly message', async () => {
    svc.create.mockRejectedValue(apiError(409, 'CATEGORY_EXISTS'));
    const fixture = await setup();
    fixture.componentInstance.newName = 'Design';
    await fixture.componentInstance.create();
    expect(fixture.componentInstance.createError()).toContain('already exists');
  });

  it('renames via the inline editor and reloads', async () => {
    const fixture = await setup();
    const design = cat('DESIGN', 'Design');
    fixture.componentInstance.startRename(design);
    expect(fixture.componentInstance.renameName).toBe('Design');
    fixture.componentInstance.renameName = 'Design & UX';
    await fixture.componentInstance.confirmRename(design.id);
    expect(svc.rename).toHaveBeenCalledWith('DESIGN', 'Design & UX');
    expect(fixture.componentInstance.renamingId()).toBeNull();
  });

  it('startDelete preselects another category as the reassignment target', async () => {
    const fixture = await setup();
    fixture.componentInstance.startDelete(cat('BUSINESS', 'Business'));
    expect(fixture.componentInstance.reassignTo).toBe('DESIGN');
    expect(fixture.componentInstance.reassignOptions().map((c) => c.id)).toEqual(['DESIGN']);
  });

  it('confirmDelete passes the reassignment target and reloads', async () => {
    const fixture = await setup();
    fixture.componentInstance.startDelete(cat('BUSINESS', 'Business'));
    await fixture.componentInstance.confirmDelete('BUSINESS' as CategoryId);
    expect(svc.delete).toHaveBeenCalledWith('BUSINESS', 'DESIGN');
    expect(fixture.componentInstance.deletingId()).toBeNull();
  });

  it('surfaces LAST_CATEGORY on delete as a friendly message', async () => {
    svc.delete.mockRejectedValue(apiError(409, 'LAST_CATEGORY'));
    const fixture = await setup();
    fixture.componentInstance.startDelete(cat('BUSINESS', 'Business'));
    await fixture.componentInstance.confirmDelete('BUSINESS' as CategoryId);
    expect(fixture.componentInstance.rowError()).toContain('cannot be deleted');
    expect(fixture.componentInstance.deletingId()).toBe('BUSINESS');
  });

  it('starting a rename cancels a pending delete (one row action at a time)', async () => {
    const fixture = await setup();
    fixture.componentInstance.startDelete(cat('BUSINESS', 'Business'));
    fixture.componentInstance.startRename(cat('DESIGN', 'Design'));
    expect(fixture.componentInstance.deletingId()).toBeNull();
    expect(fixture.componentInstance.renamingId()).toBe('DESIGN');
  });

  it('starts in the loading state with empty fields before the first fetch resolves', () => {
    TestBed.configureTestingModule({
      imports: [AdminCategoriesPageComponent],
      providers: [{ provide: AdminCategoriesService, useValue: svc }],
    });
    const cmp = TestBed.createComponent(AdminCategoriesPageComponent).componentInstance;
    expect(cmp.loading()).toBe(true);
    expect(cmp.loadError()).toBe(false);
    expect(cmp.categories()).toEqual([]);
    expect(cmp.newName).toBe('');
    expect(cmp.renameName).toBe('');
    expect(cmp.reassignTo).toBe('');
    expect(cmp.busy()).toBe(false);
  });

  it('retry re-enters the loading state and recovers from a failed load', async () => {
    svc.list.mockRejectedValueOnce(new Error('down'));
    const fixture = await setup();
    expect(fixture.componentInstance.loadError()).toBe(true);

    const retryPromise = fixture.componentInstance.retry();
    expect(fixture.componentInstance.loading()).toBe(true);
    await retryPromise;
    expect(fixture.componentInstance.loadError()).toBe(false);
    expect(fixture.componentInstance.categories()).toHaveLength(2);
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('create sets busy while in flight and clears it after', async () => {
    let release!: () => void;
    svc.create.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve(cat('NEW', 'New')))),
    );
    const fixture = await setup();
    fixture.componentInstance.newName = 'New';
    const pending = fixture.componentInstance.create();
    expect(fixture.componentInstance.busy()).toBe(true);
    release();
    await pending;
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('confirmRename trims the name, ignores a blank one, and toggles busy', async () => {
    let release!: () => void;
    svc.rename.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve(cat('DESIGN', 'X')))),
    );
    const fixture = await setup();

    fixture.componentInstance.renameName = '   ';
    await fixture.componentInstance.confirmRename('DESIGN' as CategoryId);
    expect(svc.rename).not.toHaveBeenCalled();

    fixture.componentInstance.renameName = '  X  ';
    const pending = fixture.componentInstance.confirmRename('DESIGN' as CategoryId);
    expect(fixture.componentInstance.busy()).toBe(true);
    release();
    await pending;
    expect(svc.rename).toHaveBeenCalledWith('DESIGN', 'X');
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('surfaces a rename failure and keeps the row in rename mode', async () => {
    svc.rename.mockRejectedValue(apiError(409, 'CATEGORY_EXISTS'));
    const fixture = await setup();
    fixture.componentInstance.startRename(cat('DESIGN', 'Design'));
    fixture.componentInstance.renameName = 'Business';
    await fixture.componentInstance.confirmRename('DESIGN' as CategoryId);
    expect(fixture.componentInstance.rowError()).toContain('already exists');
    expect(fixture.componentInstance.renamingId()).toBe('DESIGN');
  });

  it('startDelete on the only category leaves no reassignment target and blocks confirm', async () => {
    svc.list.mockResolvedValue([cat('OTHER', 'Other')]);
    const fixture = await setup();
    fixture.componentInstance.startDelete(cat('OTHER', 'Other'));
    expect(fixture.componentInstance.reassignTo).toBe('');

    await fixture.componentInstance.confirmDelete('OTHER' as CategoryId);
    expect(svc.delete).not.toHaveBeenCalled();
  });

  it('confirmDelete toggles busy while in flight', async () => {
    let release!: () => void;
    svc.delete.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve({ reassignedCourses: 0 }))),
    );
    const fixture = await setup();
    fixture.componentInstance.startDelete(cat('BUSINESS', 'Business'));
    const pending = fixture.componentInstance.confirmDelete('BUSINESS' as CategoryId);
    expect(fixture.componentInstance.busy()).toBe(true);
    release();
    await pending;
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('cancelRowAction clears rename, delete, and the row error', async () => {
    svc.rename.mockRejectedValue(apiError(409, 'CATEGORY_EXISTS'));
    const fixture = await setup();
    fixture.componentInstance.startRename(cat('DESIGN', 'Design'));
    fixture.componentInstance.renameName = 'Business';
    await fixture.componentInstance.confirmRename('DESIGN' as CategoryId);
    expect(fixture.componentInstance.rowError()).not.toBeNull();

    fixture.componentInstance.cancelRowAction();
    expect(fixture.componentInstance.renamingId()).toBeNull();
    expect(fixture.componentInstance.deletingId()).toBeNull();
    expect(fixture.componentInstance.rowError()).toBeNull();
  });

  describe('error message mapping', () => {
    async function createWithError(err: unknown) {
      svc.create.mockRejectedValue(err);
      const fixture = await setup();
      fixture.componentInstance.newName = 'X';
      await fixture.componentInstance.create();
      return fixture.componentInstance.createError();
    }

    it('VALIDATION_FAILED shows the server message when present', async () => {
      expect(await createWithError(apiError(400, 'VALIDATION_FAILED', 'Too long.'))).toBe(
        'Too long.',
      );
    });

    it('VALIDATION_FAILED falls back to a generic wording without a message', async () => {
      const err = new HttpErrorResponse({
        status: 400,
        error: { error: { code: 'VALIDATION_FAILED' } },
      });
      expect(await createWithError(err)).toBe('That name is not valid.');
    });

    it('CATEGORY_NOT_FOUND suggests refreshing', async () => {
      expect(await createWithError(apiError(404, 'CATEGORY_NOT_FOUND'))).toBe(
        'This category no longer exists. Refresh to update the list.',
      );
    });

    it('LAST_CATEGORY explains the rule', async () => {
      expect(await createWithError(apiError(409, 'LAST_CATEGORY'))).toBe(
        'The last remaining category cannot be deleted.',
      );
    });

    it('an unshaped error falls back to the generic message', async () => {
      expect(await createWithError(new Error('boom'))).toBe(
        'Something went wrong. Please try again.',
      );
    });
  });
});
