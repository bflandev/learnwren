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

export function deriveInitials(name: string): string {
  const trimmed = name.trim();
  // Stryker disable next-line ConditionalExpression: equivalent — when trimmed is '' the fall-through yields ''.split(/\s+/) === [''] → first '' → slice(0,2) '' too, so removing this guard returns the same ''.
  if (!trimmed) return '';
  // Stryker disable next-line Regex: equivalent — only words[0] and words[last] are used, and trimmed has no leading/trailing whitespace, so /\s/ vs /\s+/ produce the same first and last tokens.
  const words = trimmed.split(/\s+/);
  // Stryker disable next-line StringLiteral: unreachable — trimmed is non-empty so words[0] is always a defined, non-empty token; the `?? ''` never fires. Equivalent.
  const first = words[0] ?? '';
  if (words.length === 1) {
    return first.slice(0, 2).toUpperCase();
  }
  // Stryker disable next-line StringLiteral: unreachable — words always has ≥1 element so words[words.length-1] is defined; the `?? ''` never fires. Equivalent.
  const last = words[words.length - 1] ?? '';
  // Stryker disable next-line StringLiteral: unreachable — first and last are non-empty words so first[0]/last[0] are defined; the `?? ''` fallbacks never fire. Equivalent.
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}
