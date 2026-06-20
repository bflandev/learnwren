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

  it('uses the default Delete/Cancel labels when none are supplied', () => {
    const { fixture } = build();
    fixture.componentRef.setInput('message', 'Are you sure?');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="confirm-go"]')!.textContent).toContain('Delete');
    expect(el.querySelector('[data-testid="confirm-cancel"]')!.textContent).toContain('Cancel');
  });

  it('renders custom confirm/cancel labels when provided', () => {
    const { fixture } = build();
    fixture.componentRef.setInput('message', 'Are you sure?');
    fixture.componentRef.setInput('confirmLabel', 'Remove it');
    fixture.componentRef.setInput('cancelLabel', 'Keep it');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="confirm-go"]')!.textContent).toContain('Remove it');
    expect(el.querySelector('[data-testid="confirm-cancel"]')!.textContent).toContain('Keep it');
  });

  it('emits confirmed=true when Confirm is clicked', () => {
    const { fixture, cmp } = build();
    const spy = vi.spyOn(cmp.closed, 'emit');
    fixture.componentRef.setInput('message', 'Are you sure?');
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="confirm-go"]')!
      .click();
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('emits confirmed=false when Cancel is clicked', () => {
    const { fixture, cmp } = build();
    const spy = vi.spyOn(cmp.closed, 'emit');
    fixture.componentRef.setInput('message', 'Are you sure?');
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="confirm-cancel"]')!
      .click();
    expect(spy).toHaveBeenCalledWith(false);
  });
});
