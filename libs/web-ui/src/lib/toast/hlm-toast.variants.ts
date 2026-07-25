// Adapted from spartan-ng helm alert (MIT) — severity colours reuse the alert
// pattern. The toast wrapper is hosted by raw `@angular/cdk/overlay` (no
// per-toast overlay; one shared OverlayRef holds the stack), so this file
// describes ONLY the item styling. A `[data-toast-icon]` child (projected by
// the container as a severity-default Lucide glyph) gets severity-tinted via
// the descendant rules below; it shrinks to its intrinsic size and nudges
// half a baseline down so the icon optically aligns with the title cap.
import { type VariantProps, cva } from 'class-variance-authority';

const BASE =
  'pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-popover px-control-x py-control-y text-body text-popover-foreground shadow-raised [&_[data-toast-icon]]:shrink-0 [&_[data-toast-icon]]:translate-y-0.5';

// Single source of truth for the severity class map (drift-proof: SEVERITIES is
// derived from it). Unlike hlm-alert (which sits in flow and can carry a
// /15 severity tint as its body fill), toasts sit OVER live page content via
// the CDK top-layer popover. A translucent fill there reads as "this toast is
// underneath the avatar/pill behind it" — same physical stack, but the alpha
// bleed-through breaks the affordance. Body fill is therefore opaque
// `bg-popover` (set on BASE); severity is signaled by the hairline AND the
// `[data-toast-icon]` glyph, which the container projects with a default
// severity icon (overridable via `ToastInput.icon`).
export const TOAST_SEVERITY_MAP = {
  info: 'border-moss/50 [&_[data-toast-icon]]:text-moss',
  success: 'border-good/50 [&_[data-toast-icon]]:text-good',
  warning: 'border-warn/50 [&_[data-toast-icon]]:text-warn',
  error: 'border-bad/50 [&_[data-toast-icon]]:text-bad',
} as const;

export const toastVariants = cva(BASE, {
  variants: { severity: TOAST_SEVERITY_MAP },
  defaultVariants: { severity: 'info' },
});

export type ToastSeverity = NonNullable<
  VariantProps<typeof toastVariants>['severity']
>;

// Known keys — the item component normalises an unknown value to `undefined`
// so cva's defaultVariants fallback applies. Derived from the map so the list
// stays exhaustive by construction.
export const TOAST_SEVERITIES = Object.keys(
  TOAST_SEVERITY_MAP,
) as readonly ToastSeverity[];
