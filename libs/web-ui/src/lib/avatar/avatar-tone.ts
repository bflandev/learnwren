export type LwAvatarTone = 'moss' | 'clay' | 'bark' | 'paper' | 'ochre';

const AVATAR_TONES: readonly LwAvatarTone[] = ['moss', 'clay', 'bark', 'paper', 'ochre'];

export function avatarToneFor(id: string): LwAvatarTone {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    // Stryker disable next-line ArithmeticOperator: hash*31-c ≡ -(hash*31+c) at every step (sign flips uniformly), and the tone is chosen via Math.abs(hash)%5 — so +c and -c always select the same tone. Equivalent (no differing id across 783 candidates).
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % AVATAR_TONES.length;
  // Stryker disable next-line StringLiteral: index is always in [0,5) so AVATAR_TONES[index] is never undefined; the `?? 'moss'` fallback is unreachable (only present for noUncheckedIndexedAccess). Equivalent.
  return AVATAR_TONES[index] ?? 'moss';
}
