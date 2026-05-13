import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WebVideo } from './web-video';

describe('WebVideo', () => {
  let component: WebVideo;
  let fixture: ComponentFixture<WebVideo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WebVideo],
    }).compileComponents();

    fixture = TestBed.createComponent(WebVideo);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
