import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { HlmMenu } from './hlm-menu.component';
import { HlmMenuItem } from './hlm-menu-item.directive';
import { HlmMenuTrigger } from './hlm-menu-trigger.directive';

@Component({
  standalone: true,
  imports: [HlmMenuTrigger, HlmMenu, HlmMenuItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button data-test="open" [hlmMenuTriggerFor]="menu" (opened)="opened = true" (closed)="closed = true">
      Open
    </button>
    <ng-template #menu>
      <hlm-menu data-test="panel">
        <button hlmMenuItem data-test="item">Item</button>
      </hlm-menu>
    </ng-template>
  `,
})
class TestHost {
  opened = false;
  closed = false;
}

function overlay(): HTMLElement {
  return TestBed.inject(OverlayContainer).getContainerElement();
}

describe('HlmMenuTrigger', () => {
  const purge = () =>
    document.body
      .querySelectorAll('.cdk-overlay-container')
      .forEach((n) => n.remove());
  beforeEach(purge);
  afterEach(() => {
    purge();
    TestBed.resetTestingModule();
  });

  function setup() {
    TestBed.configureTestingModule({ imports: [TestHost] });
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector(
      'button[data-test="open"]',
    ) as HTMLButtonElement;
    return { fixture, trigger };
  }

  it('stamps aria-haspopup="menu" on the trigger', () => {
    const { trigger } = setup();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('opens the projected hlm-menu and emits (opened)', () => {
    const { fixture, trigger } = setup();
    expect(overlay().querySelector('[data-test="panel"]')).toBeNull();
    trigger.click();
    fixture.detectChanges();
    expect(overlay().querySelector('[data-test="panel"]')).not.toBeNull();
    expect(fixture.componentInstance.opened).toBe(true);
  });

  it('closes and emits (closed) when an item is triggered', () => {
    const { fixture, trigger } = setup();
    trigger.click();
    fixture.detectChanges();
    (overlay().querySelector('[data-test="item"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.closed).toBe(true);
  });
});
