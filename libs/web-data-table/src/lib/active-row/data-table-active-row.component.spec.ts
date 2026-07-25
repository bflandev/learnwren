import { TestBed } from '@angular/core/testing';
import { DataTableActiveRowComponent } from './data-table-active-row.component';

describe('DataTableActiveRowComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('creates', () => {
    TestBed.configureTestingModule({ imports: [DataTableActiveRowComponent] });
    const fixture = TestBed.createComponent(DataTableActiveRowComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders placeholder content', () => {
    TestBed.configureTestingModule({ imports: [DataTableActiveRowComponent] });
    const fixture = TestBed.createComponent(DataTableActiveRowComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('p')?.textContent).toContain(
      'It works',
    );
  });
});
