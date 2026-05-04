import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WebAuth } from './web-auth';

describe('WebAuth', () => {
  let component: WebAuth;
  let fixture: ComponentFixture<WebAuth>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WebAuth],
    }).compileComponents();

    fixture = TestBed.createComponent(WebAuth);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
