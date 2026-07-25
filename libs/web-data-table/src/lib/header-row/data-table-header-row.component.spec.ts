import { TestBed } from '@angular/core/testing';
import { DataTableHeaderRowComponent } from './data-table-header-row.component';

describe('DataTableHeaderRowComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('creates', () => {
    TestBed.configureTestingModule({ imports: [DataTableHeaderRowComponent] });
    const fixture = TestBed.createComponent(DataTableHeaderRowComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders placeholder content', () => {
    TestBed.configureTestingModule({ imports: [DataTableHeaderRowComponent] });
    const fixture = TestBed.createComponent(DataTableHeaderRowComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('p')?.textContent).toContain(
      'It works',
    );
  });
});
