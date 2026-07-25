import { ChangeDetectionStrategy, Component } from '@angular/core';

import { HlmAvatar, avatarToneFor, deriveInitials } from '@learnwren/web-ui';

import { TESTIMONIAL } from '../landing-content';

@Component({
  selector: 'lib-landing-testimonial',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmAvatar],
  templateUrl: './landing-testimonial.component.html',
})
export class LandingTestimonialComponent {
  protected readonly testimonial = TESTIMONIAL;
  protected readonly avatarTone = avatarToneFor('etta-holloway');
  protected readonly avatarInitials = deriveInitials(TESTIMONIAL.name);
}
