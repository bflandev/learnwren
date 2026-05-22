import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { CatalogModuleOutline } from '@learnwren/shared-data-models';

@Component({
  selector: 'lib-module-outline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './module-outline.component.html',
})
export class ModuleOutlineComponent {
  readonly modules = input.required<CatalogModuleOutline[]>();
}
