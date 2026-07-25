// Pure re-exports — no `import-for-side-effect` lines, so the barrel stays
// tree-shake-friendly and consumers can deep-import individual symbols without
// triggering hidden module-level state. Wiring (default container component +
// config) is exposed through `provideHlmToast()` so consumers see the
// dependency explicitly in `app.config.ts`.
export { HlmToast } from './hlm-toast.component';
export {
  TOAST_CLOSE_BASE,
  TOAST_DESCRIPTION_BASE,
  TOAST_TITLE_BASE,
} from './hlm-toast.component';
export {
  DEFAULT_TOAST_SEVERITY_ICONS,
  HlmToastContainer,
  TOAST_CONTAINER_BASE,
} from './hlm-toast-container.component';
export {
  DEFAULT_TOAST_DURATION,
  HLM_TOAST_CONFIG,
  HLM_TOAST_CONTAINER_COMPONENT,
  HlmToastService,
  type HlmToastConfig,
  type Toast,
  type ToastInput,
} from './hlm-toast.service';
export { provideHlmToast } from './hlm-toast.providers';
export {
  TOAST_SEVERITIES,
  TOAST_SEVERITY_MAP,
  toastVariants,
  type ToastSeverity,
} from './hlm-toast.variants';
