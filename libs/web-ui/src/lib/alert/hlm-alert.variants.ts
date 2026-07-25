// Adapted from spartan-ng helm alert (MIT). One component backs both the top-of-
// page banner and the inline notification: `severity` drives the colour (border
// + tint + icon), `appearance` drives the shape (rounded inline card vs square
// full-width banner). Colours route through the DS status roles; `error` maps to
// the destructive role. The container is a CSS grid (mirrors spartan's layout):
// with no icon it is single-column so title and description stack as rows; a
// projected `[data-alert-icon]` child switches it to two columns, spans the icon
// across both rows, and the `[&_[data-alert-icon]]` rule tints it to the severity.
import { type VariantProps, cva } from 'class-variance-authority';

const BASE =
  'group/alert relative grid w-full gap-y-0.5 border px-control-x py-control-y text-body text-ink has-[[data-alert-icon]]:grid-cols-[auto_1fr] has-[[data-alert-icon]]:gap-x-3 [&_[data-alert-icon]]:row-span-2 [&_[data-alert-icon]]:shrink-0 [&_[data-alert-icon]]:translate-y-0.5';

// Single source of truth for the severity class map (drift-proof: SEVERITIES is
// derived from it).
//
// Severity reaches FOUR layers — tint, hairline, icon, AND title — so the alert
// reads as its severity from typography before chrome. The /15 tint lands at
// L=0.926 on the L=0.985 page bg; the /50 hairline gives a confident outline;
// the `[&_hlm-alert-title]` descendant rule overrides
// the host's `text-ink` inheritance so the title picks up the severity
// `-foreground` token (info-900/100, success-900/100, etc.) at the AAA tier
// already gated by contrast.spec.ts (8.28–14.68:1 across both themes). The
// description stays `text-ink-3` so the title carries the colored
// signal and the body stays maximally legible.
export const ALERT_SEVERITY_MAP = {
  info: 'border-moss/50 bg-moss/15 [&_[data-alert-icon]]:text-moss [&_hlm-alert-title]:text-info-foreground',
  success:
    'border-good/50 bg-good/15 [&_[data-alert-icon]]:text-good [&_hlm-alert-title]:text-success-foreground',
  warning:
    'border-warn/50 bg-warn/15 [&_[data-alert-icon]]:text-warn [&_hlm-alert-title]:text-warning-foreground',
  error:
    'border-bad/50 bg-bad/15 [&_[data-alert-icon]]:text-bad [&_hlm-alert-title]:text-destructive-foreground',
} as const;

// Single source of truth for the appearance class map.
export const ALERT_APPEARANCE_MAP = {
  inline: 'rounded-control',
  banner: 'rounded-none',
} as const;

export const alertVariants = cva(BASE, {
  variants: {
    severity: ALERT_SEVERITY_MAP,
    appearance: ALERT_APPEARANCE_MAP,
  },
  defaultVariants: {
    severity: 'info',
    appearance: 'inline',
  },
});

export type AlertSeverity = NonNullable<
  VariantProps<typeof alertVariants>['severity']
>;
export type AlertAppearance = NonNullable<
  VariantProps<typeof alertVariants>['appearance']
>;

// Known keys — the component normalises an unknown value to `undefined` so cva's
// defaultVariants fallback applies. Derived from the maps so they stay
// exhaustive by construction.
export const ALERT_SEVERITIES = Object.keys(
  ALERT_SEVERITY_MAP,
) as readonly AlertSeverity[];
export const ALERT_APPEARANCES = Object.keys(
  ALERT_APPEARANCE_MAP,
) as readonly AlertAppearance[];
