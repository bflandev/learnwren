import type { LwCoverTone } from './lw-cover.component';

const COVER_TONES: readonly LwCoverTone[] = ['moss', 'clay', 'bark', 'paper', 'ochre'];

export function coverToneForId(id: string): LwCoverTone {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % COVER_TONES.length;
  return COVER_TONES[index] ?? 'moss';
}
