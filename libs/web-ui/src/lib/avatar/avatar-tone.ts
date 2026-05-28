export type LwAvatarTone = 'moss' | 'clay' | 'bark' | 'paper' | 'ochre';

const AVATAR_TONES: readonly LwAvatarTone[] = ['moss', 'clay', 'bark', 'paper', 'ochre'];

export function avatarToneFor(id: string): LwAvatarTone {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % AVATAR_TONES.length;
  return AVATAR_TONES[index] ?? 'moss';
}
