import { ChangeDetectionStrategy, Component } from '@angular/core';

import { LwWordmarkComponent } from '@learnwren/web-ui';

import { FOOTER_TAGLINE } from '../landing-content';

@Component({
  selector: 'lib-landing-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LwWordmarkComponent],
  templateUrl: './landing-footer.component.html',
})
export class LandingFooterComponent {
  protected readonly tagline = FOOTER_TAGLINE;
}
