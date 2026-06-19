import { ChangeDetectionStrategy, Component } from '@angular/core';

import { STATS } from '../landing-content';

@Component({
  selector: 'lib-landing-stats',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing-stats.component.html',
})
export class LandingStatsComponent {
  protected readonly stats = STATS;
}
