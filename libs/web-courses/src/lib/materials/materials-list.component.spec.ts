import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CourseId, LessonId, Material, MaterialId, ModuleId } from '@learnwren/shared-data-models';

import { MaterialsService } from './materials.service';
import { MaterialsListComponent } from './materials-list.component';

function mat(id: string, displayName: string): Material {
  return {
    id: id as MaterialId,
    ownerInstructorId: 'u1' as never,
    courseId: 'c1' as CourseId,
    lessonId: 'l1' as LessonId,
    displayName,
    originalFilename: `${id}.pdf`,
    extension: 'pdf',
    contentType: 'application/pdf',
    sizeBytes: 10,
    state: 'READY',
    storage: { bucket: 'b', path: `materials/${id}/source.pdf` },
    createdAt: '2026-05-21T10:00:00.000Z' as never,
    updatedAt: '2026-05-21T10:00:00.000Z' as never,
  };
}

function apiMock(over: Partial<MaterialsService> = {}): Partial<MaterialsService> {
  return {
    listMaterials: vi.fn().mockReturnValue(of([mat('m1', 'Doc One')])),
    rename: vi.fn().mockReturnValue(of(mat('m1', 'Renamed'))),
    remove: vi.fn().mockReturnValue(of(undefined)),
    getDownloadUrl: vi.fn().mockReturnValue(of({ downloadUrl: 'http://x/d', expiresAt: 'T' })),
    ...over,
  };
}

function render(
  api: Partial<MaterialsService>,
): { fixture: ComponentFixture<MaterialsListComponent>; ref: ComponentRef<MaterialsListComponent> } {
  TestBed.configureTestingModule({
    imports: [MaterialsListComponent],
    providers: [{ provide: MaterialsService, useValue: api }],
  });
  const fixture = TestBed.createComponent(MaterialsListComponent);
  fixture.componentRef.setInput('courseId', 'c1' as CourseId);
  fixture.componentRef.setInput('moduleId', 'm1' as ModuleId);
  fixture.componentRef.setInput('lessonId', 'l1' as LessonId);
  fixture.detectChanges();
  return { fixture, ref: fixture.componentRef };
}

function testIds(fixture: ComponentFixture<unknown>, id: string): HTMLElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${id}"]`));
}

describe('MaterialsListComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('lists the lesson’s materials on init', () => {
    const { fixture } = render(apiMock());
    expect(testIds(fixture, 'material-name')[0].textContent).toContain('Doc One');
  });

  it('shows the empty state when the lesson has no materials', () => {
    const { fixture } = render(apiMock({ listMaterials: vi.fn().mockReturnValue(of([])) }));
    expect(testIds(fixture, 'materials-empty')).toHaveLength(1);
  });

  it('shows a load error when listMaterials fails', () => {
    const { fixture } = render(
      apiMock({ listMaterials: vi.fn().mockReturnValue(throwError(() => new Error('x'))) }),
    );
    expect(testIds(fixture, 'materials-load-error')).toHaveLength(1);
  });

  it('renames a material through the service', async () => {
    const api = apiMock();
    const { fixture } = render(api);
    const cmp = fixture.componentInstance;
    cmp.startRename(mat('m1', 'Doc One'));
    cmp.draftName.set('Renamed');
    await cmp.commitRename(mat('m1', 'Doc One'));
    expect(api.rename).toHaveBeenCalledWith('m1', 'Renamed');
    expect(cmp.materials()[0].displayName).toBe('Renamed');
  });

  it('removes a material only after the confirm dialog is accepted', async () => {
    const api = apiMock();
    const { fixture } = render(api);
    const cmp = fixture.componentInstance;
    cmp.askRemove(mat('m1', 'Doc One'));
    await cmp.confirmRemoval(false);
    expect(api.remove).not.toHaveBeenCalled();
    cmp.askRemove(mat('m1', 'Doc One'));
    await cmp.confirmRemoval(true);
    expect(api.remove).toHaveBeenCalledWith('m1');
    expect(cmp.materials()).toHaveLength(0);
  });

  it('requests a signed URL when Download is clicked', async () => {
    const api = apiMock();
    const { fixture } = render(api);
    const cmp = fixture.componentInstance;
    const openSpy = vi
      .spyOn(cmp as unknown as { openDownload: (u: string) => void }, 'openDownload')
      .mockImplementation(() => undefined);
    await cmp.download(mat('m1', 'Doc One'));
    expect(api.getDownloadUrl).toHaveBeenCalledWith('m1');
    expect(openSpy).toHaveBeenCalledWith('http://x/d');
  });

  it('removes the material row and sets removedNotice on a 404 download error', async () => {
    const api = apiMock({
      getDownloadUrl: vi.fn().mockReturnValue(throwError(() => ({ status: 404 }))),
    });
    const { fixture } = render(api);
    const cmp = fixture.componentInstance;
    expect(cmp.materials()).toHaveLength(1);
    await cmp.download(mat('m1', 'Doc One'));
    expect(cmp.materials()).toHaveLength(0);
    expect(cmp.removedNotice()).toBe('This material is no longer available.');
  });

  it('does NOT remove the material row on a non-404 download error', async () => {
    const api = apiMock({
      getDownloadUrl: vi.fn().mockReturnValue(throwError(() => ({ status: 500 }))),
    });
    const { fixture } = render(api);
    const cmp = fixture.componentInstance;
    expect(cmp.materials()).toHaveLength(1);
    await cmp.download(mat('m1', 'Doc One'));
    expect(cmp.materials()).toHaveLength(1);
    expect(cmp.removedNotice()).toBeNull();
  });

  describe('onFilesSelected', () => {
    it('uploads the selected files then refreshes the list', async () => {
      const api = apiMock();
      const { fixture } = render(api);
      const cmp = fixture.componentInstance;
      const uploadSpy = vi.spyOn(cmp.upload, 'uploadFiles').mockResolvedValue(1);
      const file = new File(['data'], 'notes.pdf', { type: 'application/pdf' });

      await cmp.onFilesSelected({
        target: { files: [file], value: 'notes.pdf' },
      } as unknown as Event);

      expect(uploadSpy).toHaveBeenCalledWith(
        { courseId: 'c1', moduleId: 'm1', lessonId: 'l1' },
        [file],
      );
      // listMaterials runs once on init and once for the post-upload refresh.
      expect(api.listMaterials).toHaveBeenCalledTimes(2);
    });

    it('does nothing when the picker is dismissed with no files', async () => {
      const api = apiMock();
      const { fixture } = render(api);
      const cmp = fixture.componentInstance;
      const uploadSpy = vi.spyOn(cmp.upload, 'uploadFiles');

      await cmp.onFilesSelected({ target: { files: [], value: '' } } as unknown as Event);

      expect(uploadSpy).not.toHaveBeenCalled();
    });

    it('does nothing when the input exposes no file list', async () => {
      const api = apiMock();
      const { fixture } = render(api);
      const cmp = fixture.componentInstance;
      const uploadSpy = vi.spyOn(cmp.upload, 'uploadFiles');

      await cmp.onFilesSelected({ target: { files: null, value: '' } } as unknown as Event);

      expect(uploadSpy).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('reloads the materials from the service', async () => {
      const listMaterials = vi
        .fn()
        .mockReturnValueOnce(of([mat('m1', 'Doc One')]))
        .mockReturnValueOnce(of([mat('m2', 'Doc Two')]));
      const { fixture } = render(apiMock({ listMaterials }));
      const cmp = fixture.componentInstance;
      expect(cmp.materials().map((x) => x.id)).toEqual(['m1']);

      await cmp.refresh();

      expect(cmp.materials().map((x) => x.id)).toEqual(['m2']);
      expect(cmp.loadError()).toBe(false);
    });

    it('sets the load error when the reload fails', async () => {
      const listMaterials = vi
        .fn()
        .mockReturnValueOnce(of([mat('m1', 'Doc One')]))
        .mockReturnValueOnce(throwError(() => new Error('boom')));
      const { fixture } = render(apiMock({ listMaterials }));
      const cmp = fixture.componentInstance;
      expect(cmp.loadError()).toBe(false);

      await cmp.refresh();

      expect(cmp.loadError()).toBe(true);
    });
  });

  describe('rename editing state', () => {
    it('commitRename does nothing when the draft name is blank', async () => {
      const api = apiMock();
      const { fixture } = render(api);
      const cmp = fixture.componentInstance;
      cmp.startRename(mat('m1', 'Doc One'));
      cmp.draftName.set('   ');

      await cmp.commitRename(mat('m1', 'Doc One'));

      expect(api.rename).not.toHaveBeenCalled();
      expect(cmp.editingId()).toBeNull();
    });

    it('commitRename does nothing when the name is unchanged', async () => {
      const api = apiMock();
      const { fixture } = render(api);
      const cmp = fixture.componentInstance;
      cmp.startRename(mat('m1', 'Doc One'));
      cmp.draftName.set('Doc One');

      await cmp.commitRename(mat('m1', 'Doc One'));

      expect(api.rename).not.toHaveBeenCalled();
    });

    it('cancelRename clears the editing state', () => {
      const { fixture } = render(apiMock());
      const cmp = fixture.componentInstance;
      cmp.startRename(mat('m1', 'Doc One'));
      expect(cmp.editingId()).toBe('m1');

      cmp.cancelRename();

      expect(cmp.editingId()).toBeNull();
    });
  });
});
