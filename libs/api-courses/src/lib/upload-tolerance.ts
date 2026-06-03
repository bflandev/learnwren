/**
 * Tolerance multiplier applied at upload-complete when comparing the
 * HEADed object size against the declared/limit size. Covers minor storage
 * overhead so a legitimate upload that lands a few percent over its declared
 * size is not falsely rejected, while still rejecting grossly oversize blobs.
 *
 * Shared by the video and materials upload-completion paths so both features
 * use one tolerance. Intentionally api-courses-internal (not exported from the
 * lib barrel, not in shared-data-models).
 */
export const UPLOAD_SIZE_TOLERANCE = 1.05;
