import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { HlmInput } from '@learnwren/web-ui';

@Component({
  selector: 'lib-course-search-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, HlmInput],
  templateUrl: './course-search-bar.component.html',
})
export class CourseSearchBarComponent {
  private readonly router = inject(Router);
  readonly query = signal('');

  submit(): void {
    const q = this.query().trim();
    if (q) {
      void this.router.navigate(['/search'], { queryParams: { q } });
    } else {
      void this.router.navigate(['/catalog']);
    }
  }
}
