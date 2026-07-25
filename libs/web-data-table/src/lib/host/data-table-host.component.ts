import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DataTableFilterStore } from '../state/data-table-filter-store';
import { DataTableStateService } from '../state/data-table-state.service';

/**
 * Wraps a `<lw-data-table-title-bar>` + `<lw-data-table-list>` pair and
 * provides them with a shared, instance-scoped `DataTableStateService`.
 *
 * Layout: the host is a horizontal flex with three projection slots — a left
 * rail, the default `.data-table-host__main` column (title-bar + list), and a
 * right rail. Place a right-hand sidebar with a static `side="right"` attribute
 * (not a `[side]` binding); content-projection selectors only match the static
 * attribute, so a `[side]` binding would fall back into the left rail.
 *
 * Constraint: exactly one `<lw-data-table-list>` per host. The host's service
 * is shared by every descendant table, so nesting two tables under the same
 * host causes the second table's `setColumns(...)` to silently overwrite the
 * first, and the controls overlay will only reflect the survivor. To render
 * multiple tables on a page, wrap each in its own `<lw-data-table-host>`.
 */
@Component({
  selector: 'lw-data-table-host',
  standalone: true,
  template: `
    <ng-content select="lw-data-table-sidebar:not([side=right])" />
    <div class="data-table-host__main"><ng-content /></div>
    <ng-content select="lw-data-table-sidebar[side=right]" />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: row;
      min-height: 0;
      height: 100%;
    }
    .data-table-host__main {
      display: flex;
      flex-direction: column;
      flex: 1 1 0;
      min-width: 0;
      min-height: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DataTableStateService, DataTableFilterStore],
})
export class DataTableHostComponent {}
