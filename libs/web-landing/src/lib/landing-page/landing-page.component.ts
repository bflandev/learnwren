import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';

import { LandingFeaturesComponent } from '../landing-features/landing-features.component';
import { LandingFooterComponent } from '../landing-footer/landing-footer.component';
import { LandingHeroComponent } from '../landing-hero/landing-hero.component';
import { LandingPricingComponent } from '../landing-pricing/landing-pricing.component';
import { LandingShelfComponent } from '../landing-shelf/landing-shelf.component';
import { LandingStatsComponent } from '../landing-stats/landing-stats.component';
import { LandingStepsComponent } from '../landing-steps/landing-steps.component';
import { LandingTestimonialComponent } from '../landing-testimonial/landing-testimonial.component';

@Component({
  selector: 'lib-landing-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LandingHeroComponent,
    LandingStatsComponent,
    LandingShelfComponent,
    LandingStepsComponent,
    LandingFeaturesComponent,
    LandingTestimonialComponent,
    LandingPricingComponent,
    LandingFooterComponent,
  ],
  templateUrl: './landing-page.component.html',
})
export class LandingPageComponent implements OnInit, OnDestroy {
  private readonly title = inject(Title);

  ngOnInit(): void {
    this.title.setTitle('Learn Wren — slow lessons for small communities');
  }

  ngOnDestroy(): void {
    // No other page sets a title, so leaving without this restore would keep
    // the marketing tagline on every subsequent route's tab.
    this.title.setTitle('Learn Wren');
  }
}
