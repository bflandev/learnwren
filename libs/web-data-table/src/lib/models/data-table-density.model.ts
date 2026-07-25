/** Density registers for the data-grid. The host [data-lw-density] rebinds cell
 * padding and the virtualized row height (--lw-row-height); it never touches
 * app-wide spacing or control padding (PVED-10586). Kept in lockstep with the
 * app's DisplayPrefsService `DensityChoice` union — this lib can't import the
 * app, so the two are maintained together. */
export type DataTableDensity = 'compact' | 'normal' | 'spacious';
