/**
 * CommitState — ported from grid-lab DSE-7B.
 *
 * Discriminated union covering the four observable states of any
 * user-driven mutation surface: clean (pristine), dirty (local edits),
 * committing (in-flight save), fresh (just-committed flash that
 * auto-decays back to clean), and error (last attempt failed).
 * Surfaces own their own controller; the type is volatile and never
 * persisted.
 *
 * Replaces the ad-hoc isLoading/isSaving/isSaved booleans that drawers
 * and forms each rolled by hand, so save-UX (dirty pill, "Saving…"
 * spinner, success flash, error banner) reads the same way everywhere.
 */

export type CommitState =
  | { readonly kind: 'clean' }
  | { readonly kind: 'dirty' }
  | { readonly kind: 'committing'; readonly startedAt: number }
  | {
      readonly kind: 'fresh';
      readonly committedAt: number;
      readonly until: number;
    }
  | {
      readonly kind: 'error';
      readonly message: string;
      readonly code?: string;
      readonly recoverable: boolean;
    };

export const CLEAN: CommitState = { kind: 'clean' };
export const DIRTY: CommitState = { kind: 'dirty' };

export type CommitStateKind = CommitState['kind'];
