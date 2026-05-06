import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import type { Course } from '@learnwren/shared-data-models';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly featuredCourses: readonly Course[] = [];
}
