import { ChangeDetectionStrategy, Component } from '@angular/core';

import { LwAvatarComponent } from '@learnwren/web-ui';

import { TESTIMONIAL } from '../landing-content';

@Component({
  selector: 'lib-landing-testimonial',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LwAvatarComponent],
  templateUrl: './landing-testimonial.component.html',
})
export class LandingTestimonialComponent {
  protected readonly testimonial = TESTIMONIAL;
}
