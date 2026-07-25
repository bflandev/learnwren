// Capacity caps shared by the BFF view-filter validators. The grid-view and
// admin-spaces controllers enforce different per-key predicates (allowlist vs.
// key-length), but must agree on these limits — extracting them here prevents
// the two from silently drifting apart.
export const MAX_FILTER_ENTRIES = 150;
export const MAX_FILTER_VALUE_LENGTH = 200;

// Upper bound on the columns array a saved view may carry. The admin editor
// persists the whole column catalog (every field with its visible/order/pin
// state), so this must sit safely above the live catalog size (donor grid item +
// system columns, ~136 today) with headroom to grow.
export const MAX_VIEW_COLUMNS = 250;
