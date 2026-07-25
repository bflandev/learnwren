// Adapted from spartan-ng helm badge (MIT).
import { type VariantProps, cva } from 'class-variance-authority';

// BASE owns shape + interaction; size + type size live on the `density` axis
// below so grid-headers (compact) and drawer chips (comfortable) can ride the
// same tone variants. Default density preserves the spartan padding/text-size
// pairing so existing call sites are byte-identical without a `density` prop.
// `cursor-default` suppresses the text I-beam so a badge reads as a label/chip,
// not selectable copy — matching the date-picker trigger / menu-item precedent.
const BASE =
  'inline-flex cursor-default items-center rounded-md border font-semibold transition-colors focus-ring';

// Single source of truth for the variant class map: cva builds its variant string
// from this object and `BADGE_VARIANTS` derives its runtime keys from it, so the
// type-valid variants and the directive's normalisation set cannot drift.
// Every painted variant sets an explicit border-color — BASE supplies the
// `border` width but Tailwind v4 has no default border-color and this app has no
// global border reset, so without one a bordered badge paints `currentColor`.
// Neutral chips (`default`, `secondary`) and `outline` take the `--lw-line`
// role; the soft-tint status families take a faint family-tinted
// `--lw-badge-*-border` rim (decorative reinforcement); `ghost`/`link` stay
// `border-transparent` so BASE's width is layout-neutral.
//
// `default` is the neutral chip: the gated `--lw-badge-neutral-*` palette
// (gray.200/gray.900 light, gray.700/gray.100 dark) per the design brief "Neutral fill
// gray-200 with gray-950 text". The brand accent (`--lw-ochre`) is reserved
// for selection/focus/links (the design brief's "The One Accent Rule"), so the default
// badge does not ride it.
//
// `destructive` rides the gated `--lw-badge-danger-*` soft-tint pair
// (danger.100/danger.900 light, danger.900/danger.100 dark — 13.89:1 both),
// NOT the shadcn `bg-destructive`/`text-destructive-foreground` roles. Those
// roles pair a solid danger.500/400 fill with a `-foreground` token authored as
// status TEXT on a soft background, so used together as a badge they fell to
// 3.83:1 (light) / 2.18:1 (dark) — below AA. The soft-tint danger pair matches
// the other status families and is covered by contrast.spec.ts.
//
// `ghost` and `link` extend beyond canonical spartan (whose badge ships only the
// four above) — they mirror the button's chromeless/link treatments for callers
// that want an unboxed or link-styled badge, kept on the same `--lw-*` roles.
// `link` uses `--lw-button-link-fg` (accent.700 light / accent.300 dark) — the
// AA-safe link accent — NOT `text-ochre` (accent.500), which only reaches
// 2.88:1 on the light page background. Same dynamic that keeps the link BUTTON
// off accent.500; the rendered pair is gated by contrast.spec.ts.
//
// `info` / `success` / `warning` / `category` ride the gated `--lw-badge-*`
// soft-tint pairs (AA/AAA in contrast.spec.ts, 8.13–10.32:1), exposed via cva
// so the full semantic vocabulary (4 status families + taxonomy) is reachable
// from the design system instead of being re-rolled at the call site. They
// follow the same shape as `destructive` — soft tint bg + dark ink, mirrored
// in dark theme — so the badge family stays a single rhythm of restraint.
export const BADGE_VARIANT_MAP = {
  default: 'border-line bg-badge-neutral-bg text-badge-neutral-fg',
  secondary: 'border-line bg-secondary text-secondary-foreground',
  destructive:
    'border-badge-danger-border bg-badge-danger-bg text-badge-danger-fg',
  info: 'border-badge-info-border bg-badge-info-bg text-badge-info-fg',
  success:
    'border-badge-success-border bg-badge-success-bg text-badge-success-fg',
  warning: 'border-badge-warn-border bg-badge-warn-bg text-badge-warn-fg',
  category:
    'border-badge-category-border bg-badge-category-bg text-badge-category-fg',
  outline: 'border-line text-ink',
  ghost: 'border-transparent hover:bg-accent hover:text-accent-foreground',
  link: 'border-transparent text-button-link-fg underline-offset-4 hover:underline',
} as const;

// `density` is orthogonal to `variant`: the same tone (success, info, ...) can
// ride three sizes without re-rolling the colour rails. `compact` is tuned for
// grid-header chips and dense toolbars (hairline `py-px` so the type size
// dictates row height); `comfortable` is the drawer/dialog size where the
// badge is the chip-as-control. Default preserves the spartan baseline so
// every existing call site renders byte-identically.
export const BADGE_DENSITY_MAP = {
  compact: 'px-1.5 py-px text-xs',
  default: 'px-2.5 py-0.5 text-xs',
  comfortable: 'px-3 py-1 text-sm',
} as const;

export const badgeVariants = cva(BASE, {
  variants: {
    variant: BADGE_VARIANT_MAP,
    density: BADGE_DENSITY_MAP,
  },
  defaultVariants: {
    variant: 'default',
    density: 'default',
  },
});

export type BadgeVariant = NonNullable<
  VariantProps<typeof badgeVariants>['variant']
>;

export type BadgeDensity = NonNullable<
  VariantProps<typeof badgeVariants>['density']
>;

// Known variant keys — the directive normalises an unknown value to `undefined`
// so cva's defaultVariants fallback applies. Derived from BADGE_VARIANT_MAP so it
// stays exhaustive by construction.
export const BADGE_VARIANTS = Object.keys(
  BADGE_VARIANT_MAP,
) as readonly BadgeVariant[];

export const BADGE_DENSITIES = Object.keys(
  BADGE_DENSITY_MAP,
) as readonly BadgeDensity[];
