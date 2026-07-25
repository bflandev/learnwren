// Adapted from spartan-ng helm calendar (MIT). Composes brain's `[brnCalendar]`
// grid engine (date math, focus roving, a11y) and paints it on the DS `--lw-*`
// roles. This component self-provides the Luxon adapter (not app-wide), so it's
// self-contained. Labels are formatted with Luxon directly to sidestep brain's
// i18n `formatHeader`, whose 0-indexed month is off by one against Luxon's.
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  model,
  viewChild,
} from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';
import {
  BrnCalendar,
  BrnCalendarImports,
  type Weekday,
  injectBrnCalendarI18n,
} from '@spartan-ng/brain/calendar';
import { provideDateAdapter } from '@spartan-ng/brain/date-time';
import { BrnLuxonDateAdapter } from '@spartan-ng/brain/date-time-luxon';
import { DateTime } from 'luxon';
import { cn } from '../_internal/cn';
import { HlmButton } from '../button/hlm-button.directive';
import { HlmIcon } from '../icon/hlm-icon.component';

// Exported so the lib-wide token-discipline spec can lint these class strings.
export const CALENDAR_BASE =
  'inline-block rounded-md border border-line bg-popover p-3 text-popover-foreground';
export const CALENDAR_HEADER_BASE = 'flex items-center justify-between pb-2';
export const CALENDAR_TITLE_BASE = 'text-body font-medium';
export const CALENDAR_WEEKDAY_BASE =
  'w-9 pb-1 text-helper font-normal text-ink-3';
export const CALENDAR_CELL_BASE = 'p-0 text-center';
export const CALENDAR_CELL_BUTTON_BASE =
  'inline-flex size-9 items-center justify-center rounded-md text-body font-normal hover:bg-bg-3 focus-ring data-[today]:bg-bg-3 data-[selected]:bg-ochre data-[selected]:text-ochre-ink data-[selected]:hover:bg-ochre data-[outside]:text-ink-3 data-[outside]:opacity-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

@Component({
  selector: 'hlm-calendar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  exportAs: 'hlmCalendar',
  imports: [...BrnCalendarImports, HlmButton, HlmIcon],
  providers: [
    provideIcons({ lucideChevronLeft, lucideChevronRight }),
    provideDateAdapter(BrnLuxonDateAdapter),
  ],
  template: `
    <div
      [class]="computedClass()"
      brnCalendar
      [date]="date()"
      (dateChange)="onDateChange($event)"
      [min]="min()"
      [max]="max()"
      [disabled]="disabled()"
      [dateDisabled]="_dateDisabled"
      [weekStartsOn]="weekStartsOn()"
      [defaultFocusedDate]="defaultFocusedDate()">
      <div [class]="headerClass">
        <button
          hlmBtn
          variant="outline"
          size="icon"
          class="size-7 p-0"
          brnCalendarPreviousButton>
          <hlm-icon name="lucideChevronLeft" class="size-4" />
        </button>
        <span brnCalendarHeader [class]="titleClass">{{ heading() }}</span>
        <button
          hlmBtn
          variant="outline"
          size="icon"
          class="size-7 p-0"
          brnCalendarNextButton>
          <hlm-icon name="lucideChevronRight" class="size-4" />
        </button>
      </div>
      <table brnCalendarGrid class="w-full border-collapse">
        <thead>
          <tr>
            <th
              *brnCalendarWeekday="let weekday"
              scope="col"
              [class]="weekdayClass">
              {{ weekdayLabel(weekday) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr *brnCalendarWeek="let week">
            @for (day of week; track trackDay(day)) {
              <td brnCalendarCell [class]="cellClass">
                <button
                  brnCalendarCellButton
                  [date]="day"
                  [class]="cellButtonClass">
                  {{ dayLabel(day) }}
                </button>
              </td>
            }
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class HlmCalendar {
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public readonly userClass = input<string>('', { alias: 'class' });

  public readonly date = model<DateTime | undefined>(undefined);
  public readonly min = input<DateTime | undefined>(undefined);
  public readonly max = input<DateTime | undefined>(undefined);
  public readonly disabled = input(false, { transform: booleanAttribute });
  public readonly dateDisabled = input<(date: DateTime) => boolean>(
    () => false,
  );
  public readonly weekStartsOn = input<Weekday | undefined>(undefined);
  public readonly defaultFocusedDate = input<DateTime | undefined>(undefined);

  private readonly _i18n = injectBrnCalendarI18n();
  // brain's focused date drives the month/year heading (prev/next advance it).
  private readonly _brn = viewChild(BrnCalendar);

  protected readonly headerClass = CALENDAR_HEADER_BASE;
  protected readonly titleClass = CALENDAR_TITLE_BASE;
  protected readonly weekdayClass = CALENDAR_WEEKDAY_BASE;
  protected readonly cellClass = CALENDAR_CELL_BASE;
  protected readonly cellButtonClass = CALENDAR_CELL_BUTTON_BASE;

  protected readonly computedClass = computed(() =>
    cn(CALENDAR_BASE, this.userClass()),
  );

  protected readonly heading = computed(() => {
    const cal = this._brn();
    if (!cal) return '';
    const focused = cal.focusedDate() as DateTime | undefined;
    return focused ? focused.toFormat('LLLL yyyy') : '';
  });

  // Bridge brain's `(date: unknown)` predicate to our typed `(date: DateTime)` input.
  protected readonly _dateDisabled = (date: unknown): boolean =>
    this.dateDisabled()(date as DateTime);

  protected onDateChange(value: unknown): void {
    this.date.set(value as DateTime | undefined);
  }

  protected weekdayLabel(index: number): string {
    return this._i18n.config().formatWeekdayName(index);
  }

  protected dayLabel(date: unknown): number {
    return (date as DateTime).day;
  }

  protected trackDay(date: unknown): number {
    return (date as DateTime).toMillis();
  }
}
