import { TestBed } from '@angular/core/testing';
import { ToolBoxComponent } from './tool-box.component';

describe('ToolBoxComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('creates', () => {
    TestBed.configureTestingModule({ imports: [ToolBoxComponent] });
    const fixture = TestBed.createComponent(ToolBoxComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders placeholder content', () => {
    TestBed.configureTestingModule({ imports: [ToolBoxComponent] });
    const fixture = TestBed.createComponent(ToolBoxComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('p')?.textContent).toContain(
      'It works',
    );
  });
});
