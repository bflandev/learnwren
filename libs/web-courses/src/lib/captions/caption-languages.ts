import { resolveCaptionLanguage } from '@learnwren/shared-data-models';

// ponytail: a fixed list of widely used languages; the API accepts any known
// BCP-47 tag, so widen this list (or add a free-text field) if instructors need more.
const CAPTION_LANGUAGE_CODES = [
  'ar', 'bn', 'de', 'en', 'es', 'fa', 'fr', 'he', 'hi', 'id', 'it', 'ja', 'ko', 'nl', 'pl',
  'pt', 'pt-BR', 'ru', 'sv', 'sw', 'th', 'tr', 'uk', 'ur', 'vi', 'zh-Hans', 'zh-Hant',
];

/** Language picker options for caption upload, sorted by label. */
export function captionLanguageOptions(): { language: string; label: string }[] {
  return CAPTION_LANGUAGE_CODES
    // Stryker disable next-line ArrayDeclaration: equivalent — every code above resolves (pinned by the 27-option spec), so the ?? fallback never runs
    .flatMap((code) => resolveCaptionLanguage(code) ?? [])
    .sort((a, b) => a.label.localeCompare(b.label));
}
