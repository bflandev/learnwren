import type { LwCoverTone } from './lw-cover.component';

const COVER_TONES: readonly LwCoverTone[] = ['moss', 'clay', 'bark', 'paper', 'ochre'];

export function coverToneForId(id: string): LwCoverTone {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    // Stryker disable next-line ArithmeticOperator: hash*31-c ≡ -(hash*31+c) at every step (sign flips uniformly), and the tone is chosen via Math.abs(hash)%5 — so +c and -c always select the same tone. Equivalent (no differing id across 783 candidates).
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % COVER_TONES.length;
  // Stryker disable next-line StringLiteral: index is always in [0,5) so COVER_TONES[index] is never undefined; the `?? 'moss'` fallback is unreachable (only present for noUncheckedIndexedAccess). Equivalent.
  return COVER_TONES[index] ?? 'moss';
}
