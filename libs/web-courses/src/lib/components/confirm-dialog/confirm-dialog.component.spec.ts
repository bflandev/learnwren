import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  function build(): { fixture: ReturnType<typeof TestBed.createComponent<ConfirmDialogComponent>>; cmp: ConfirmDialogComponent } {
    TestBed.configureTestingModule({ imports: [ConfirmDialogComponent] });
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    return { fixture, cmp: fixture.componentInstance };
  }

  it('renders the supplied message', () => {
    const { fixture } = build();
    fixture.componentRef.setInput('message', 'Delete this lesson?');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Delete this lesson?');
  });

  it('emits confirmed=true when Confirm is clicked', () => {
    const { fixture, cmp } = build();
    const spy = vi.spyOn(cmp.closed, 'emit');
    fixture.componentRef.setInput('message', 'Are you sure?');
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="confirm"]')!
      .click();
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('emits confirmed=false when Cancel is clicked', () => {
    const { fixture, cmp } = build();
    const spy = vi.spyOn(cmp.closed, 'emit');
    fixture.componentRef.setInput('message', 'Are you sure?');
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="cancel"]')!
      .click();
    expect(spy).toHaveBeenCalledWith(false);
  });
});
