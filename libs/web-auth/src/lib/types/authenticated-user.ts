import type { MeResponse } from '@learnwren/shared-data-models';

/**
 * The user as the web client sees them. Same shape as the server's MeResponse
 * — keeping a single re-exported alias means the brand on `uid` and the
 * `role` union stay in lockstep across the wire.
 */
export type AuthenticatedUser = MeResponse;
