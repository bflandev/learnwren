import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HERO_CONTENT } from '../landing-content';

@Component({
  selector: 'lib-landing-hero',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './landing-hero.component.html',
})
export class LandingHeroComponent {
  protected readonly hero = HERO_CONTENT;
}
