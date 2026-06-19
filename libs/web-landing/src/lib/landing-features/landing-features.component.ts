import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FEATURES, FEATURES_INTRO } from '../landing-content';

@Component({
  selector: 'lib-landing-features',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing-features.component.html',
})
export class LandingFeaturesComponent {
  protected readonly intro = FEATURES_INTRO;
  protected readonly features = FEATURES;
}
