import { Component } from '@angular/core';
import type { Course } from '@learnwren/shared-data-models';
import { FirestoreSmokeComponent } from './dev/firestore-smoke.component';

@Component({
  imports: [FirestoreSmokeComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly featuredCourses: readonly Course[] = [];
}
