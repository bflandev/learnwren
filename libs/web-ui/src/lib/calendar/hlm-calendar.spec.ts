import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BrnCalendar } from '@spartan-ng/brain/calendar';
import { provideDateAdapter } from '@spartan-ng/brain/date-time';
import { BrnLuxonDateAdapter } from '@spartan-ng/brain/date-time-luxon';
import { DateTime } from 'luxon';
import { CALENDAR_CELL_BUTTON_BASE, HlmCalendar } from './hlm-calendar.component';

// Spec scope: brain owns the grid generation, focus roving, and a11y wiring,
// all exercised by brain's own suite. The helm layer's contract is: (1) it
// composes `[brnCalendar]` so the consumer writes only `<hlm-calendar>`; (2) it
// renders the seven weekday headers + the day-cell grid; (3) the month/year
// heading reflects the focused date; (4) selecting a cell writes through the
// two-way `date` model. The Luxon adapter is provided here because the lib
// mandates it (see hlm-calendar.component.ts).
@Component({
  standalone: true,
  imports: [HlmCalendar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-calendar [(date)]="picked" />`,
})
class TestHost {
  readonly picked = signal<DateTime | undefined>(
    DateTime.fromObject({ year: 2025, month: 1, day: 15 }),
  );
}

function setup() {
  TestBed.configureTestingModule({
    providers: [provideDateAdapter(BrnLuxonDateAdapter)],
  });
  const fixture = TestBed.createComponent(TestHost);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, host: fixture.componentInstance };
}

describe('HlmCalendar', () => {
  it('composes the brain [brnCalendar] grid engine', () => {
    const { fixture } = setup();
    expect(
      fixture.debugElement.query(By.directive(BrnCalendar)),
    ).not.toBeNull();
  });

  it('paints the calendar surface on the DS popover roles', () => {
    const { root } = setup();
    const surface = root.querySelector('[brnCalendar]') as HTMLElement;
    expect(surface.classList.contains('bg-popover')).toBe(true);
    expect(surface.classList.contains('text-popover-foreground')).toBe(true);
  });

  it('renders the seven weekday column headers', () => {
    const { root } = setup();
    const headers = root.querySelectorAll('th[scope="col"]');
    expect(headers.length).toBe(7);
  });

  it('renders the month/year heading from the focused date', () => {
    const { fixture, root } = setup();
    // The heading reads brain's focused date via a signal viewChild; flush a
    // second CD so the query result is reflected into the binding.
    fixture.detectChanges();
    const header = root.querySelector('[brnCalendarHeader]') as HTMLElement;
    expect(header.textContent?.trim()).toBe('January 2025');
  });

  it('paints day cells with the cell-button base tokens', () => {
    const { root } = setup();
    const cell = root.querySelector(
      'button[brnCalendarCellButton]',
    ) as HTMLButtonElement;
    expect(cell).toBeTruthy();
    for (const cls of CALENDAR_CELL_BUTTON_BASE.split(/\s+/)) {
      // data-* variant utilities live on the same string; assert the static
      // (non-variant) tokens land, which is enough to prove the base applied.
      if (cls.includes(':')) continue;
      expect(cell.classList.contains(cls), `cell missing \`${cls}\``).toBe(true);
    }
  });

  it('writes the selected date back through the two-way model on cell click', () => {
    const { fixture, root, host } = setup();
    const buttons = Array.from(
      root.querySelectorAll('button[brnCalendarCellButton]'),
    ) as HTMLButtonElement[];
    // Pick a clearly in-month, enabled day (the 10th) to avoid outside/disabled.
    const tenth = buttons.find((b) => b.textContent?.trim() === '10');
    expect(tenth).toBeTruthy();
    tenth?.click();
    fixture.detectChanges();
    const picked = host.picked();
    expect(picked).toBeTruthy();
    expect(picked?.day).toBe(10);
    expect(picked?.month).toBe(1);
  });
});
