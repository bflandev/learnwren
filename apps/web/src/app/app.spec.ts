import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: Firestore, useValue: {} }],
    }).compileComponents();
  });

  it('should render the Learn Wren placeholder hero with Tailwind styling', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const hero: HTMLElement | null = fixture.nativeElement.querySelector('[data-testid="hero"]');
    expect(hero).not.toBeNull();
    expect(hero!.textContent).toContain('Learn Wren');
    expect(hero!.classList.contains('text-3xl')).toBe(true);
  });
});
