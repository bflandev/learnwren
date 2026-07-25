// WCAG contrast math over CSS color strings (oklch supported via culori).
// Consumed by contrast.spec.ts now; Slice B reuses it for component-token pairs.
import { parse, wcagContrast } from 'culori';

export function contrastRatio(foreground, background) {
  const fg = parse(foreground);
  const bg = parse(background);
  if (!fg) throw new Error(`unparseable color: ${foreground}`);
  if (!bg) throw new Error(`unparseable color: ${background}`);
  return wcagContrast(fg, bg);
}
