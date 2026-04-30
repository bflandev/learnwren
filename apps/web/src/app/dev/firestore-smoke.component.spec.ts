import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { describe, expect, it } from 'vitest';

import { FirestoreSmokeComponent } from './firestore-smoke.component';

// Scope: render only. Behavioural coverage of run() (setDoc/getDoc against
// the real Firestore handle) is delegated to the manual emulator round-trip
// in the firebase-wiring-and-secrets plan, not asserted here.
describe('FirestoreSmokeComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FirestoreSmokeComponent],
      providers: [{ provide: Firestore, useValue: {} }],
    }).compileComponents();
  });

  it('renders the Dev tools disclosure with a Run button', () => {
    const fixture = TestBed.createComponent(FirestoreSmokeComponent);
    fixture.detectChanges();
    const summary: HTMLElement | null = fixture.nativeElement.querySelector('summary');
    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('button');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain('Dev tools');
    expect(button).not.toBeNull();
    expect(button!.textContent).toContain('Run Firestore smoke');
  });
});
