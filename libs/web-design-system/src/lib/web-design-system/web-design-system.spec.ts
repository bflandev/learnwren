import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WebDesignSystem } from './web-design-system';

describe('WebDesignSystem', () => {
  let component: WebDesignSystem;
  let fixture: ComponentFixture<WebDesignSystem>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WebDesignSystem],
    }).compileComponents();

    fixture = TestBed.createComponent(WebDesignSystem);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
