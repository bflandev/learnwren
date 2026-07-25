// Wiring for `HlmToastService` lives here (not in the service file) so that
// `provideHlmToast()` can statically import the container component without
// pulling the container's `inject(HlmToastService)` back into the service
// module's own import graph — which would form a service→container→service
// cycle at module evaluation time.
import type { Provider } from '@angular/core';
import { HlmToastContainer } from './hlm-toast-container.component';
import {
  DEFAULT_TOAST_DURATION,
  HLM_TOAST_CONFIG,
  HLM_TOAST_CONTAINER_COMPONENT,
  type HlmToastConfig,
} from './hlm-toast.service';

/**
 * Application provider for the toast subsystem. Returns the default container
 * binding plus a config provider; consumers MUST call this (e.g. in
 * `app.config.ts`) for `HlmToastService.show(...)` to render anything.
 *
 * Override either binding individually if a consumer needs a custom container
 * (e.g. for layout overrides) or a non-default duration.
 */
export function provideHlmToast(
  config: Partial<HlmToastConfig> = {},
): Provider[] {
  return [
    {
      provide: HLM_TOAST_CONFIG,
      useValue: { duration: DEFAULT_TOAST_DURATION, ...config },
    },
    { provide: HLM_TOAST_CONTAINER_COMPONENT, useValue: HlmToastContainer },
  ];
}
