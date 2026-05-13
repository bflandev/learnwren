import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WebCourses } from './web-courses';

describe('WebCourses', () => {
  let component: WebCourses;
  let fixture: ComponentFixture<WebCourses>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WebCourses],
    }).compileComponents();

    fixture = TestBed.createComponent(WebCourses);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
