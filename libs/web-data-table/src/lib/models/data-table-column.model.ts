import type { Type } from '@angular/core';

/**
 * Describes one column rendered by `<lw-data-table-list>`.
 * `id` doubles as the TanStack column id and the property key looked up
 * on each `DataTableRow`. `header` is the visible label.
 */
export interface DataTableColumn {
  readonly id: string;
  readonly header: string;
  /** Initial column width in px. Defaults to 200. */
  readonly width?: number;
  /** Minimum resizable width in px. Defaults to 100. */
  readonly minWidth?: number;
  /** Maximum resizable width in px. Defaults to 600. */
  readonly maxWidth?: number;
  /** Whether the user can pin this column to the left or right. Defaults to true. */
  readonly pinnable?: boolean;
  /** When false, the column cannot be hidden: no hide affordances are
   * rendered and TanStack `enableHiding` is off. Defaults to true. */
  readonly hideable?: boolean;
  /** When false, the column cannot be resized: no resize handle is rendered and
   * TanStack `enableResizing` is off. Defaults to true. */
  readonly resizable?: boolean;
  /** Value domain for filtering. Drives the filter editor's input control. */
  readonly type?: 'string' | 'number' | 'boolean' | 'date';
  /** Enumerated choices for filtering; when present the editor renders a select. */
  readonly options?: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  /** When true, the column is not editable: the inline editor renders its
   * control read-only. Defaults to false (editable). */
  readonly readonly?: boolean;
  /** When set, this column's cells render this Angular component (via TanStack
   * `flexRenderComponent`) instead of the default stringified value. The
   * component reads its row via
   * `injectFlexRenderContext<CellContext<DataTableRow, unknown>>()`. The shared
   * lib stays domain-agnostic — the consumer owns the component. */
  readonly cellComponent?: Type<unknown>;
}
