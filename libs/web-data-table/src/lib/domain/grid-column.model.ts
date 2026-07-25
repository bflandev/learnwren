/** Grid column contracts, ported from the donor design system's domain lib.
 * Only the subset the data-table consumes came along; feature layers supply
 * concrete columns when they adopt the grid. */

export type GridControlType =
  | 'text'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'select'
  | 'combobox';

export interface GridSelectOption {
  label: string;
  value: string | number | boolean;
}

export interface ColumnDefDto {
  field: string;
  header: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  width?: number;
  control?: GridControlType;
  options?: GridSelectOption[];
  allowCustom?: boolean;
  canHide?: boolean;
  canResize?: boolean;
  required?: boolean;
}

export type ColumnFixed = 'LEFT' | 'RIGHT' | null;

export interface ResolvedColumn {
  field: string;
  header: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  control?: GridControlType;
  options?: GridSelectOption[];
  allowCustom?: boolean;
  visible: boolean;
  fixed: ColumnFixed;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  columnToolTip?: string;
}

export type CellValueDto = string | number | boolean | null;
