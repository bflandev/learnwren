import { TestBed } from '@angular/core/testing';
import { DataTableRowComponent } from './data-table-row.component';

describe('DataTableRowComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('creates', () => {
    TestBed.configureTestingModule({ imports: [DataTableRowComponent] });
    const fixture = TestBed.createComponent(DataTableRowComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders placeholder content', () => {
    TestBed.configureTestingModule({ imports: [DataTableRowComponent] });
    const fixture = TestBed.createComponent(DataTableRowComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('p')?.textContent).toContain(
      'It works',
    );
  });
});
