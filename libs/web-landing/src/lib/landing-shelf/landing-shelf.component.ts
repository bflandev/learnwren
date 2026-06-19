import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { LwCardComponent, LwCoverComponent, LwPillComponent } from '@learnwren/web-ui';

import { FEATURED_COURSES, SHELF_INTRO } from '../landing-content';

@Component({
  selector: 'lib-landing-shelf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LwCardComponent, LwCoverComponent, LwPillComponent],
  templateUrl: './landing-shelf.component.html',
})
export class LandingShelfComponent {
  protected readonly intro = SHELF_INTRO;
  protected readonly courses = FEATURED_COURSES;
}
