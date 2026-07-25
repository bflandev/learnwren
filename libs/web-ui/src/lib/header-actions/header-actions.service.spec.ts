import { ChangeDetectionStrategy, Component, TemplateRef, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { HeaderActionsService } from './header-actions.service';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-template #a>A</ng-template><ng-template #b>B</ng-template>',
})
class TplHost {
  readonly a = viewChild.required<TemplateRef<unknown>>('a');
  readonly b = viewChild.required<TemplateRef<unknown>>('b');
}

function makeHost(): TplHost {
  TestBed.configureTestingModule({ imports: [TplHost] });
  const fixture = TestBed.createComponent(TplHost);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('HeaderActionsService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts with null content', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(HeaderActionsService).content()).toBeNull();
  });

  it('setContent stores the template', () => {
    const host = makeHost();
    const svc = TestBed.inject(HeaderActionsService);
    svc.setContent(host.a());
    expect(svc.content()).toBe(host.a());
  });

  it('clear() with no argument resets content to null', () => {
    const host = makeHost();
    const svc = TestBed.inject(HeaderActionsService);
    svc.setContent(host.a());
    svc.clear();
    expect(svc.content()).toBeNull();
  });

  it('clear(template) only clears when it matches the current content', () => {
    const host = makeHost();
    const svc = TestBed.inject(HeaderActionsService);
    svc.setContent(host.a());
    svc.clear(host.b()); // stale clear from an older owner — ignored
    expect(svc.content()).toBe(host.a());
    svc.clear(host.a());
    expect(svc.content()).toBeNull();
  });
});
