/**
 * Minimal view descriptor consumed by `ViewPickerComponent`. Kept local to
 * this lib so the lib stays free of `the domain models`; feature code
 * maps `SpaceMetadataDto.views` (id + displayName) onto this shape.
 *
 * `name` is the human-readable label AND the favorite key within a space
 * (favorites are keyed by space + view name).
 */
export interface DataTableView {
  readonly id: string;
  readonly name: string;
}
