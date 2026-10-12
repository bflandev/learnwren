import type { LwCoverTone } from './lw-cover.component';

const COVER_TONES: readonly LwCoverTone[] = ['moss', 'clay', 'bark', 'paper', 'ochre'];

export function coverToneForId(id: string): LwCoverTone {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    // Stryker disable next-line ArithmeticOperator: hash*31-c ≡ -(hash*31+c) at every step (sign flips uniformly), and the tone is chosen via Math.abs(hash)%5 — so +c and -c always select the same tone. Equivalent (no differing id across 783 candidates).
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % COVER_TONES.length;
  // index is always in [0, COVER_TONES.length), so the lookup is defined.
  return COVER_TONES[index] as LwCoverTone;
}
