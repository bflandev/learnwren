/*
 * Lib-wide token-discipline guard.
 *
 * stylelint lints .css/.scss but is BLIND to the Tailwind utility strings
 * embedded in the lib's .ts wrappers — every `*_BASE` const and every cva
 * variant/size map. So a raw hex colour, an arbitrary px length, a raw
 * `var()`, or a Tailwind default colour ramp could slip into a class string
 * unnoticed and bypass the `--lw-*` semantic-token rails. This pure unit test
 * (no TestBed) imports EVERY exported class-string source in the lib and
 * asserts none of them drift off-token.
 *
 * Allowlist (conscious exceptions, not blind spots): the guard flags only
 *   - raw hex colours          (#abc / #aabbcc)
 *   - arbitrary px lengths     ([16px])
 *   - raw var() references     (var(--x))
 *   - Tailwind default ramps   (gray-50, amber-600, …)
 * It deliberately PERMITS tokenless layout arbitraries that have no semantic
 * token and use no px/hex/var — e.g. `min-w-[8rem]` (menu, rem-based) — and
 * Tailwind variant modifiers that merely contain brackets, e.g.
 * `data-[state=checked]:*`. Those never match the patterns below.
 */

import { AVATAR_BASE, AVATAR_SIZE_MAP } from './avatar/hlm-avatar.component';
import {
  BADGE_DENSITY_MAP,
  BADGE_VARIANT_MAP,
} from './badge/hlm-badge.variants';
import {
  BREADCRUMB_ELLIPSIS_BASE,
  BREADCRUMB_ITEM_BASE,
  BREADCRUMB_LINK_BASE,
  BREADCRUMB_LIST_BASE,
  BREADCRUMB_PAGE_BASE,
  BREADCRUMB_SEPARATOR_BASE,
} from './breadcrumb/hlm-breadcrumb.directive';
import {
  BUTTON_GROUP_BASE,
  BUTTON_GROUP_ORIENTATION_MAP,
} from './button-group/hlm-button-group.directive';
import {
  ACTION_BASE,
  CARD_BASE,
  CONTENT_BASE,
  DESCRIPTION_BASE,
  FOOTER_BASE,
  HEADER_BASE,
  TITLE_BASE,
} from './card/hlm-card.component';
import { CHECKBOX_BASE } from './checkbox/hlm-checkbox.directive';
import { DOTS_BASE } from './dots/hlm-dots.component';
import {
  FORM_FIELD_BASE,
  FORM_FIELD_ERROR_BASE,
  FORM_FIELD_HINT_BASE,
} from './form-field/hlm-form-field.component';
import { HEADING_VARIANT_MAP } from './heading/hlm-heading.variants';
import { ICON_BASE } from './icon/hlm-icon.component';
import { INPUT_BASE } from './input/hlm-input.directive';
import {
  LIST_BASE,
  LIST_DIVIDED,
  LIST_ITEM_BASE,
} from './list/hlm-list.directive';
import {
  PANEL_BASE,
  PANEL_BODY_BASE,
  PANEL_HEADER_BASE,
} from './panel/hlm-panel.component';
import {
  PROGRESS_BAR_BASE,
  PROGRESS_INDET_BASE,
  PROGRESS_TRACK_BASE,
} from './progress/hlm-progress.component';
import { RADIO_BASE } from './radio/hlm-radio.directive';
import {
  RESIZABLE_BASE,
  RESIZABLE_VERTICAL,
} from './resizable/hlm-resizable.component';
import {
  RESIZABLE_HANDLE_BASE,
  RESIZABLE_PANEL_BASE,
} from './resizable/hlm-resizable.parts';
import {
  SIDEBAR_BASE,
  SIDEBAR_BORDER_MAP,
  SIDEBAR_TRIGGER_BASE,
  SIDEBAR_WIDTH_MAP,
} from './sidebar/hlm-sidebar.component';
import {
  SIDEBAR_CONTENT_BASE,
  SIDEBAR_FOOTER_BASE,
  SIDEBAR_HEADER_BASE,
  SIDEBAR_RAIL_CONTENT,
  SIDEBAR_RAIL_HEADER,
} from './sidebar/hlm-sidebar.parts';
import { SKELETON_BASE } from './skeleton/hlm-skeleton.component';
import { SPINNER_SIZE_MAP } from './spinner/hlm-spinner.variants';
import { TEXTAREA_BASE } from './textarea/hlm-textarea.directive';

// Every exported class-string source in the lib: each wrapper's base const(s)
// plus the cva variant/size maps (their values are the class strings).
//
// Tier 1 (Task 4): the 25 leaf components. Each later tier (Tasks 5-9) MUST
// import its new *_BASE / variant-map exports here and ratchet the floor up
// to the actual count — that ratchet is what keeps this guard from going
// silently vacuous.
const CLASS_STRINGS: readonly string[] = [
  AVATAR_BASE,
  CARD_BASE,
  HEADER_BASE,
  TITLE_BASE,
  DESCRIPTION_BASE,
  CONTENT_BASE,
  FOOTER_BASE,
  ACTION_BASE,
  ICON_BASE,
  INPUT_BASE,
  LIST_BASE,
  LIST_DIVIDED,
  LIST_ITEM_BASE,
  SKELETON_BASE,
  DOTS_BASE,
  PROGRESS_TRACK_BASE,
  PROGRESS_BAR_BASE,
  PROGRESS_INDET_BASE,
  SIDEBAR_BASE,
  SIDEBAR_TRIGGER_BASE,
  SIDEBAR_HEADER_BASE,
  SIDEBAR_CONTENT_BASE,
  SIDEBAR_FOOTER_BASE,
  SIDEBAR_RAIL_HEADER,
  SIDEBAR_RAIL_CONTENT,
  BUTTON_GROUP_BASE,
  CHECKBOX_BASE,
  RADIO_BASE,
  TEXTAREA_BASE,
  FORM_FIELD_BASE,
  FORM_FIELD_HINT_BASE,
  FORM_FIELD_ERROR_BASE,
  BREADCRUMB_LIST_BASE,
  BREADCRUMB_ITEM_BASE,
  BREADCRUMB_LINK_BASE,
  BREADCRUMB_PAGE_BASE,
  BREADCRUMB_SEPARATOR_BASE,
  BREADCRUMB_ELLIPSIS_BASE,
  PANEL_BASE,
  PANEL_HEADER_BASE,
  PANEL_BODY_BASE,
  RESIZABLE_BASE,
  RESIZABLE_VERTICAL,
  RESIZABLE_PANEL_BASE,
  RESIZABLE_HANDLE_BASE,
  ...Object.values(AVATAR_SIZE_MAP),
  ...Object.values(BADGE_VARIANT_MAP),
  ...Object.values(BADGE_DENSITY_MAP),
  ...Object.values(BUTTON_GROUP_ORIENTATION_MAP),
  ...Object.values(HEADING_VARIANT_MAP),
  ...Object.values(SPINNER_SIZE_MAP),
  ...Object.values(SIDEBAR_WIDTH_MAP),
  ...Object.values(SIDEBAR_BORDER_MAP),
];

const allClasses = CLASS_STRINGS.join(' ');

describe('lib-wide .ts class strings (token discipline)', () => {
  it('aggregates every exported class-string source', () => {
    // Guards against a const being dropped from the aggregate (which would
    // silently stop linting it). Floor only rises when wrappers are added;
    // lower it only if a wrapper is intentionally removed (the >= means adding
    // never breaks it). 0 → 78 in Tier 1 (Task 4): 45 base consts + 33 variant
    // map entries (avatar 3, badge 10+3, button-group 2, heading 3, spinner 4,
    // sidebar 6+2).
    expect(CLASS_STRINGS.length).toBeGreaterThanOrEqual(78);
  });

  it('contains no raw hex colour', () => {
    expect(allClasses).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  it('contains no arbitrary px value (use a --lw-* spacing/size token)', () => {
    expect(allClasses).not.toMatch(/\[\d+px\]/);
  });

  it('contains no raw var() reference (use a registered semantic utility)', () => {
    expect(allClasses).not.toMatch(/var\(/);
  });

  it('contains no Tailwind default colour ramp (use an lw semantic role)', () => {
    // The one donor bg-gray-50 leak is fixed on port; this keeps the whole
    // default palette (gray-50, amber-600, …) out of lib class strings.
    expect(allClasses).not.toMatch(
      /\b(?:red|amber|gray|zinc|slate|stone|neutral|blue|green|yellow|orange|purple|pink|rose|sky|indigo|violet|cyan|teal|lime|emerald|fuchsia)-\d+\b/,
    );
  });
});
