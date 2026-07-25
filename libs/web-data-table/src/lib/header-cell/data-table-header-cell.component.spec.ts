import { TestBed } from '@angular/core/testing';
import { DataTableHeaderCellComponent } from './data-table-header-cell.component';

describe('DataTableHeaderCellComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('creates', () => {
    TestBed.configureTestingModule({ imports: [DataTableHeaderCellComponent] });
    const fixture = TestBed.createComponent(DataTableHeaderCellComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders placeholder content', () => {
    TestBed.configureTestingModule({ imports: [DataTableHeaderCellComponent] });
    const fixture = TestBed.createComponent(DataTableHeaderCellComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('p')?.textContent).toContain(
      'It works',
    );
  });
});
