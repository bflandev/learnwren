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

import { CONFIRM_DIALOG_PANEL_BASE } from './alert-dialog/confirm-dialog-container.component';
import { DATE_PICKER_TRIGGER_BASE } from './date-picker/hlm-date-picker.component';
import { DURATION_PICKER_TRIGGER_BASE } from './duration-picker/hlm-duration-picker.component';
import {
  AUTOCOMPLETE_CONTENT_BASE,
  AUTOCOMPLETE_EMPTY_BASE,
  AUTOCOMPLETE_INPUT_BASE,
  AUTOCOMPLETE_ITEM_BASE,
  AUTOCOMPLETE_ITEM_INDICATOR_BASE,
  AUTOCOMPLETE_LIST_BASE,
} from './autocomplete/hlm-autocomplete.directive';
import { AVATAR_BASE, AVATAR_SIZE_MAP } from './avatar/hlm-avatar.component';
import {
  BUTTON_SIZE_MAP,
  BUTTON_VARIANT_MAP,
} from './button/hlm-button.variants';
import {
  DIALOG_CLOSE_BASE,
  DIALOG_CONTENT_BASE,
  DIALOG_DESCRIPTION_BASE,
  DIALOG_FOOTER_BASE,
  DIALOG_HEADER_BASE,
  DIALOG_OVERLAY_BASE,
  DIALOG_TITLE_BASE,
} from './dialog/hlm-dialog.component';
import { LABEL_BASE } from './label/hlm-label.directive';
import {
  MENU_ITEM_BASE,
  MENU_ITEM_SELECTED_TINT,
} from './menu/hlm-menu-item.directive';
import { MENU_BASE } from './menu/hlm-menu.component';
import { POPOVER_CONTENT_BASE } from './popover/hlm-popover.directive';
import { SEPARATOR_BASE } from './separator/hlm-separator.component';
import { THUMB, TRACK_BASE } from './switch/hlm-switch.component';
import {
  TABS_BASE,
  TABS_CONTENT_BASE,
  TABS_LIST_BASE,
  TABS_TRIGGER_BASE,
} from './tabs/hlm-tabs.directive';
import {
  TABS_LIST_VARIANT_MAP,
  TABS_SIZE_MAP,
  TABS_TRIGGER_VARIANT_MAP,
} from './tabs/hlm-tabs.variants';
import { TOGGLE_BASE } from './toggle/hlm-toggle.directive';
import {
  TOGGLE_GROUP_BASE,
  TOGGLE_GROUP_ITEM_BASE,
  TOGGLE_GROUP_OUTLINE_CONNECT,
  TOGGLE_GROUP_PILL_GAP,
} from './toggle-group/hlm-toggle-group.directive';
import { TOGGLE_GROUP_ITEM_APPEARANCE_MAP } from './toggle-group/hlm-toggle-group.variants';
import { TOOLTIP_CONTENT_BASE } from './tooltip/hlm-tooltip.directive';
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
// Tier 3 (Task 6)
import {
  ALERT_CLOSE_BASE,
  ALERT_DESCRIPTION_BASE,
  ALERT_TITLE_BASE,
} from './alert/hlm-alert.component';
import {
  ALERT_APPEARANCE_MAP,
  ALERT_SEVERITY_MAP,
} from './alert/hlm-alert.variants';
import { BOOLEAN_RADIO_BASE } from './boolean-radio/hlm-boolean-radio.component';
import {
  CALENDAR_BASE,
  CALENDAR_CELL_BASE,
  CALENDAR_CELL_BUTTON_BASE,
  CALENDAR_HEADER_BASE,
  CALENDAR_TITLE_BASE,
  CALENDAR_WEEKDAY_BASE,
} from './calendar/hlm-calendar.component';
import {
  COMBOBOX_CONTENT_BASE,
  COMBOBOX_EMPTY_BASE,
  COMBOBOX_INPUT_BASE,
  COMBOBOX_ITEM_BASE,
  COMBOBOX_ITEM_INDICATOR_BASE,
  COMBOBOX_ITEM_SELECTED_TINT,
  COMBOBOX_LIST_BASE,
  COMBOBOX_TRIGGER_BASE,
  COMBOBOX_VALUE_BASE,
} from './combobox/hlm-combobox.directive';
import { COMBOBOX_PILL_REMOVE_BASE } from './combobox/hlm-combobox-chips.component';
import {
  GRID_STATE_BASE,
  GRID_STATE_MESSAGE_BASE,
} from './grid-state/hlm-grid-state.component';
import {
  PAGINATION_BASE,
  PAGINATION_ELLIPSIS_BASE,
  PAGINATION_LIST_BASE,
} from './pagination/hlm-pagination.component';
import {
  REORDERABLE_HANDLE_BASE,
  REORDERABLE_ITEM_BASE,
  REORDERABLE_ITEM_DRAGGABLE,
  REORDERABLE_LIST_BASE,
  REORDERABLE_PLACEHOLDER_BASE,
} from './reorderable-list/hlm-reorderable-list.component';
import {
  SELECT_CONTENT_BASE,
  SELECT_ITEM_BASE,
  SELECT_ITEM_INDICATOR_BASE,
  SELECT_ITEM_SELECTED_TINT,
  SELECT_LIST_BASE,
  SELECT_TRIGGER_BASE,
} from './select/hlm-select.directive';
import { SELECT_PILL_REMOVE_BASE } from './select/hlm-select-pills.component';
import {
  SHEET_CONTENT_BASE,
  SHEET_SIDE_MAP,
} from './sheet/hlm-sheet.component';
import { TAGS_BASE } from './tags/hlm-tags.component';
import {
  TOAST_CLOSE_BASE,
  TOAST_DESCRIPTION_BASE,
  TOAST_TITLE_BASE,
} from './toast/hlm-toast.component';
import { TOAST_CONTAINER_BASE } from './toast/hlm-toast-container.component';
import { TOAST_SEVERITY_MAP } from './toast/hlm-toast.variants';

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
  LABEL_BASE,
  SEPARATOR_BASE,
  TRACK_BASE,
  THUMB,
  TOGGLE_BASE,
  TOGGLE_GROUP_BASE,
  TOGGLE_GROUP_ITEM_BASE,
  TOGGLE_GROUP_OUTLINE_CONNECT,
  TOGGLE_GROUP_PILL_GAP,
  TABS_BASE,
  TABS_LIST_BASE,
  TABS_TRIGGER_BASE,
  TABS_CONTENT_BASE,
  TOOLTIP_CONTENT_BASE,
  POPOVER_CONTENT_BASE,
  DIALOG_OVERLAY_BASE,
  DIALOG_CONTENT_BASE,
  DIALOG_HEADER_BASE,
  DIALOG_FOOTER_BASE,
  DIALOG_TITLE_BASE,
  DIALOG_DESCRIPTION_BASE,
  DIALOG_CLOSE_BASE,
  MENU_BASE,
  MENU_ITEM_BASE,
  MENU_ITEM_SELECTED_TINT,
  AUTOCOMPLETE_INPUT_BASE,
  AUTOCOMPLETE_CONTENT_BASE,
  AUTOCOMPLETE_LIST_BASE,
  AUTOCOMPLETE_ITEM_BASE,
  AUTOCOMPLETE_ITEM_INDICATOR_BASE,
  AUTOCOMPLETE_EMPTY_BASE,
  // Tier 3 (Task 6)
  ALERT_TITLE_BASE,
  ALERT_DESCRIPTION_BASE,
  ALERT_CLOSE_BASE,
  BOOLEAN_RADIO_BASE,
  CALENDAR_BASE,
  CALENDAR_HEADER_BASE,
  CALENDAR_TITLE_BASE,
  CALENDAR_WEEKDAY_BASE,
  CALENDAR_CELL_BASE,
  CALENDAR_CELL_BUTTON_BASE,
  COMBOBOX_TRIGGER_BASE,
  COMBOBOX_VALUE_BASE,
  COMBOBOX_INPUT_BASE,
  COMBOBOX_CONTENT_BASE,
  COMBOBOX_LIST_BASE,
  COMBOBOX_ITEM_BASE,
  COMBOBOX_ITEM_INDICATOR_BASE,
  COMBOBOX_ITEM_SELECTED_TINT,
  COMBOBOX_EMPTY_BASE,
  COMBOBOX_PILL_REMOVE_BASE,
  GRID_STATE_BASE,
  GRID_STATE_MESSAGE_BASE,
  PAGINATION_BASE,
  PAGINATION_LIST_BASE,
  PAGINATION_ELLIPSIS_BASE,
  REORDERABLE_LIST_BASE,
  REORDERABLE_ITEM_BASE,
  REORDERABLE_ITEM_DRAGGABLE,
  REORDERABLE_HANDLE_BASE,
  REORDERABLE_PLACEHOLDER_BASE,
  SELECT_TRIGGER_BASE,
  SELECT_CONTENT_BASE,
  SELECT_LIST_BASE,
  SELECT_ITEM_BASE,
  SELECT_ITEM_INDICATOR_BASE,
  SELECT_ITEM_SELECTED_TINT,
  SELECT_PILL_REMOVE_BASE,
  SHEET_CONTENT_BASE,
  TAGS_BASE,
  TOAST_TITLE_BASE,
  TOAST_DESCRIPTION_BASE,
  TOAST_CLOSE_BASE,
  TOAST_CONTAINER_BASE,
  ...Object.values(AVATAR_SIZE_MAP),
  ...Object.values(BADGE_VARIANT_MAP),
  ...Object.values(BADGE_DENSITY_MAP),
  ...Object.values(BUTTON_GROUP_ORIENTATION_MAP),
  ...Object.values(HEADING_VARIANT_MAP),
  ...Object.values(SPINNER_SIZE_MAP),
  ...Object.values(SIDEBAR_WIDTH_MAP),
  ...Object.values(SIDEBAR_BORDER_MAP),
  ...Object.values(BUTTON_VARIANT_MAP),
  ...Object.values(BUTTON_SIZE_MAP),
  ...Object.values(TOGGLE_GROUP_ITEM_APPEARANCE_MAP),
  ...Object.values(TABS_LIST_VARIANT_MAP),
  ...Object.values(TABS_TRIGGER_VARIANT_MAP),
  ...Object.values(TABS_SIZE_MAP),
  CONFIRM_DIALOG_PANEL_BASE,
  DATE_PICKER_TRIGGER_BASE,
  DURATION_PICKER_TRIGGER_BASE,
  ...Object.values(ALERT_SEVERITY_MAP),
  ...Object.values(ALERT_APPEARANCE_MAP),
  ...Object.values(SHEET_SIDE_MAP),
  ...Object.values(TOAST_SEVERITY_MAP),
];

const allClasses = CLASS_STRINGS.join(' ');

describe('lib-wide .ts class strings (token discipline)', () => {
  it('aggregates every exported class-string source', () => {
    // Guards against a const being dropped from the aggregate (which would
    // silently stop linting it). Floor only rises when wrappers are added;
    // lower it only if a wrapper is intentionally removed (the >= means adding
    // never breaks it). 0 → 78 in Tier 1 (Task 4): 45 base consts + 33 variant
    // map entries (avatar 3, badge 10+3, button-group 2, heading 3, spinner 4,
    // sidebar 6+2). 78 → 130 in Tier 2 (Task 5): 31 base consts (label 1,
    // separator 1, switch 2, toggle 1, toggle-group 4, tabs 4, tooltip 1,
    // popover 1, dialog 7, menu 3, autocomplete 6) + 21 variant map entries
    // (button 6+4, toggle-group item 2, tabs 3+3+3). 130 → 187 in Tier 3
    // (Task 6): 43 base consts (alert 3, boolean-radio 1, calendar 6,
    // combobox 10, grid-state 2, pagination 3, reorderable-list 5, select 7,
    // sheet 1, tags 1, toast 4) + 14 variant map entries (alert 4+2, sheet 4,
    // toast 4). 187 → 190 in Tiers 4-5 (Tasks 7-8): 3 base consts
    // (alert-dialog confirm panel 1, date-picker trigger 1,
    // duration-picker trigger 1).
    expect(CLASS_STRINGS.length).toBeGreaterThanOrEqual(190);
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
