import { ChangeDetectionStrategy, Component } from '@angular/core';

import { STEPS, STEPS_INTRO } from '../landing-content';

@Component({
  selector: 'lib-landing-steps',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing-steps.component.html',
})
export class LandingStepsComponent {
  protected readonly intro = STEPS_INTRO;
  protected readonly steps = STEPS;
}
