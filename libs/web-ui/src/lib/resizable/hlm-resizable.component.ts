// Two-panel resizable container with a draggable divider. Native pointer events
// (no CDK — @angular/cdk/drag-drop is not resolvable in this workspace). Owns a
// two-way `ratio` model (0..1 = the first panel's fraction of the long axis),
// clamped to [min, 1 - min]. Layout is a declarative CSS grid: the host is a
// grid whose long axis is split into `<ratio>fr min-content <1-ratio>fr`, so the
// projected panel/handle/panel auto-place into the three tracks — no inline
// style mutation of children. The divider (hlmResizableHandle) is a keyboard-
// and pointer-operable separator. Bases are exported so token-discipline.spec
// can lint them.
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
} from '@angular/core';
import { cn } from '../_internal/cn';

export type ResizableOrientation = 'horizontal' | 'vertical';
export const RESIZABLE_BASE = 'grid h-full w-full';
export const RESIZABLE_VERTICAL = 'grid-cols-1';

@Component({
  selector: 'hlm-resizable',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  exportAs: 'hlmResizable',
  host: {
    '[class]': 'computedClass()',
    '[style.grid-template-columns]':
      "orientation() === 'vertical' ? null : trackTemplate()",
    '[style.grid-template-rows]':
      "orientation() === 'vertical' ? trackTemplate() : null",
  },
})
export class HlmResizable {
  readonly el = inject(ElementRef<HTMLElement>);
  readonly ratio = model<number>(0.5);
  readonly min = input<number>(0.1);
  readonly step = input<number>(0.02);
  readonly orientation = input<ResizableOrientation>('horizontal');
  // Stryker disable next-line all: Angular signal-input options must stay a
  // statically analyzable object literal; instrumented mutants fatal ngtsc.
  readonly userClass = input<string>('', { alias: 'class' });

  readonly clampedRatio = computed(() => this.clamp(this.ratio()));

  protected readonly trackTemplate = computed(() => {
    const r = this.clampedRatio();
    return `${r}fr min-content ${1 - r}fr`;
  });

  protected readonly computedClass = computed(() =>
    cn(
      RESIZABLE_BASE,
      this.orientation() === 'vertical' ? RESIZABLE_VERTICAL : '',
      this.userClass(),
    ),
  );

  // Clamp to [min, 1 - min]; coerce non-finite input to `min` so a NaN can never
  // latch into the model or the grid template.
  private clamp(value: number): number {
    const m = this.min();
    if (!Number.isFinite(value)) return m;
    return Math.min(1 - m, Math.max(m, value));
  }

  setRatioFromPointer(clientPos: number): void {
    const rect = this.el.nativeElement.getBoundingClientRect();
    const vertical = this.orientation() === 'vertical';
    const extent = vertical ? rect.height : rect.width;
    // A zero extent divides to ±Infinity/NaN below; the isFinite guard bails.
    const raw = (clientPos - (vertical ? rect.top : rect.left)) / extent;
    if (!Number.isFinite(raw)) return;
    this.ratio.set(this.clamp(raw));
  }

  nudge(delta: number): void {
    this.ratio.set(this.clamp(this.clampedRatio() + delta));
  }
}
