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

  it('paints header, title, weekday, and cell chrome on the exported bases', () => {
    const { root } = setup();
    // CALENDAR_HEADER_BASE
    const header = root.querySelector('[brnCalendar] > div') as HTMLElement;
    for (const cls of ['flex', 'items-center', 'justify-between', 'pb-2']) {
      expect(header.classList.contains(cls), `header missing \`${cls}\``).toBe(
        true,
      );
    }
    // CALENDAR_TITLE_BASE
    const title = root.querySelector('[brnCalendarHeader]') as HTMLElement;
    expect(title.classList.contains('text-body')).toBe(true);
    expect(title.classList.contains('font-medium')).toBe(true);
    // CALENDAR_WEEKDAY_BASE
    const weekday = root.querySelector('th[scope="col"]') as HTMLElement;
    for (const cls of ['w-9', 'pb-1', 'text-helper', 'text-ink-3']) {
      expect(
        weekday.classList.contains(cls),
        `weekday missing \`${cls}\``,
      ).toBe(true);
    }
    // CALENDAR_CELL_BASE
    const cell = root.querySelector('td[brnCalendarCell]') as HTMLElement;
    expect(cell.classList.contains('p-0')).toBe(true);
    expect(cell.classList.contains('text-center')).toBe(true);
  });

  it('labels every weekday header with non-empty text', () => {
    const { root } = setup();
    const headers = Array.from(
      root.querySelectorAll('th[scope="col"]'),
    ) as HTMLElement[];
    for (const th of headers) {
      expect((th.textContent ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('renders an empty heading while the brain viewChild is unresolved', () => {
    // Arrange — stub the brain query to the unresolved (undefined) state the
    // guard exists for; the heading must fall back to '' rather than
    // dereference undefined.
    TestBed.configureTestingModule({
      providers: [provideDateAdapter(BrnLuxonDateAdapter)],
    });
    const fixture = TestBed.createComponent(HlmCalendar);
    const component = fixture.componentInstance as unknown as {
      heading(): string;
      _brn: () => unknown;
    };
    component._brn = () => undefined;
    // Act / Assert — no calendar yet → ''.
    expect(component.heading()).toBe('');
  });

  it('renders an empty heading when brain has no focused date yet', () => {
    // Arrange — stub the brain query to a calendar without a focused date.
    TestBed.configureTestingModule({
      providers: [provideDateAdapter(BrnLuxonDateAdapter)],
    });
    const fixture = TestBed.createComponent(HlmCalendar);
    const component = fixture.componentInstance as unknown as {
      heading(): string;
      _brn: () => unknown;
    };
    component._brn = () => ({ focusedDate: () => undefined });
    // Act / Assert
    expect(component.heading()).toBe('');
  });

  it('bridges the typed dateDisabled predicate through to brain unchanged', () => {
    // Arrange — a direct fixture so the signal input can be driven.
    TestBed.configureTestingModule({
      providers: [provideDateAdapter(BrnLuxonDateAdapter)],
    });
    const fixture = TestBed.createComponent(HlmCalendar);
    const tenth = DateTime.fromObject({ year: 2025, month: 1, day: 10 });
    const calendar = fixture.componentInstance as unknown as {
      _dateDisabled: (date: unknown) => boolean;
    };
    // Assert — default predicate: every date enabled (strictly false)…
    expect(calendar._dateDisabled(tenth)).toBe(false);
    // …and a consumer predicate is consulted with the same date.
    fixture.componentRef.setInput(
      'dateDisabled',
      (date: DateTime) => date.day === 10,
    );
    expect(calendar._dateDisabled(tenth)).toBe(true);
    expect(
      calendar._dateDisabled(
        DateTime.fromObject({ year: 2025, month: 1, day: 11 }),
      ),
    ).toBe(false);
  });

  it('tracks day cells by their epoch millis', () => {
    const { fixture } = setup();
    const calendar = fixture.debugElement.query(By.directive(HlmCalendar))
      .componentInstance as unknown as { trackDay(date: unknown): number };
    const day = DateTime.fromObject({ year: 2025, month: 1, day: 10 });
    expect(calendar.trackDay(day)).toBe(day.toMillis());
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
