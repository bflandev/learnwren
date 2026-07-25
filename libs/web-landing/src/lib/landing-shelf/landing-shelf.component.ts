import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HlmBadge, HlmButton, HlmCard, LwCoverComponent } from '@learnwren/web-ui';

import { FEATURED_COURSES, SHELF_INTRO } from '../landing-content';

@Component({
  selector: 'lib-landing-shelf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HlmBadge, HlmButton, HlmCard, LwCoverComponent],
  templateUrl: './landing-shelf.component.html',
})
export class LandingShelfComponent {
  protected readonly intro = SHELF_INTRO;
  protected readonly courses = FEATURED_COURSES;
}
