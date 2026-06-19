import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { PRICING_CTA_ROUTE, PRICING_INTRO, PRICING_TIERS } from '../landing-content';

@Component({
  selector: 'lib-landing-pricing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './landing-pricing.component.html',
})
export class LandingPricingComponent {
  protected readonly intro = PRICING_INTRO;
  protected readonly tiers = PRICING_TIERS;
  protected readonly ctaRoute = PRICING_CTA_ROUTE;
}
