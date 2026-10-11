export type LwAvatarTone = 'moss' | 'clay' | 'bark' | 'paper' | 'ochre';

const AVATAR_TONES: readonly LwAvatarTone[] = ['moss', 'clay', 'bark', 'paper', 'ochre'];

export function avatarToneFor(id: string): LwAvatarTone {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    // Stryker disable next-line ArithmeticOperator: hash*31-c ≡ -(hash*31+c) at every step (sign flips uniformly), and the tone is chosen via Math.abs(hash)%5 — so +c and -c always select the same tone. Equivalent (no differing id across 783 candidates).
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % AVATAR_TONES.length;
  // index is always in [0, AVATAR_TONES.length), so the lookup is defined.
  return AVATAR_TONES[index] as LwAvatarTone;
}

export function deriveInitials(name: string): string {
  const trimmed = name.trim();
  // Stryker disable next-line ConditionalExpression: equivalent — when trimmed is '' the fall-through yields ''.split(/\s+/) === [''] → first '' → slice(0,2) '' too, so removing this guard returns the same ''.
  if (!trimmed) return '';
  // Stryker disable next-line Regex: equivalent — only words[0] and words[last] are used, and trimmed has no leading/trailing whitespace, so /\s/ vs /\s+/ produce the same first and last tokens.
  const words = trimmed.split(/\s+/);
  if (words.length === 1) {
    return trimmed.slice(0, 2).toUpperCase();
  }
  // trimmed has no edge whitespace, so its first char starts the first word and
  // the last split token is a non-empty word.
  const last = words[words.length - 1] as string;
  return (trimmed.charAt(0) + last.charAt(0)).toUpperCase();
}
