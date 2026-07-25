import {
  HlmReorderableItem,
  HlmReorderableList,
} from './hlm-reorderable-list.component';

export {
  HlmReorderableItem,
  HlmReorderableList,
  REORDERABLE_HANDLE_BASE,
  REORDERABLE_ITEM_BASE,
  REORDERABLE_ITEM_DRAGGABLE,
  REORDERABLE_LIST_BASE,
  REORDERABLE_PLACEHOLDER_BASE,
  type HlmReorderableHandlePosition,
  type ReorderEvent,
  type ReorderableItemContext,
} from './hlm-reorderable-list.component';

// Convenience bag — pull `...HlmReorderableListImports` into a standalone
// `imports` array to get the list container + the item-template directive.
export const HlmReorderableListImports = [
  HlmReorderableList,
  HlmReorderableItem,
] as const;
