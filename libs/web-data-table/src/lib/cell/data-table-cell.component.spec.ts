import { TestBed } from '@angular/core/testing';
import { DataTableCellComponent } from './data-table-cell.component';

describe('DataTableCellComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('creates', () => {
    TestBed.configureTestingModule({ imports: [DataTableCellComponent] });
    const fixture = TestBed.createComponent(DataTableCellComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders placeholder content', () => {
    TestBed.configureTestingModule({ imports: [DataTableCellComponent] });
    const fixture = TestBed.createComponent(DataTableCellComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('p')?.textContent).toContain(
      'It works',
    );
  });
});
