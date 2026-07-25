import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  HlmCard,
  HlmCardAction,
  HlmCardContent,
  HlmCardDescription,
  HlmCardFooter,
  HlmCardHeader,
  HlmCardTitle,
} from './hlm-card.component';

// Mirrors the avatar/menu specs (Vitest globals + jsdom). A small host composes
// the full card so we can assert each wrapper projects its content and carries
// its cn() base classes, and that a consumer `class` merges on the surface.
@Component({
  standalone: true,
  imports: [
    HlmCard,
    HlmCardHeader,
    HlmCardTitle,
    HlmCardDescription,
    HlmCardContent,
    HlmCardFooter,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-card class="w-80">
      <hlm-card-header>
        <hlm-card-title>Story</hlm-card-title>
        <hlm-card-description>A draft awaiting review.</hlm-card-description>
      </hlm-card-header>
      <hlm-card-content>Filed against the bureau deadline.</hlm-card-content>
      <hlm-card-footer><button type="button">Publish</button></hlm-card-footer>
    </hlm-card>
  `,
})
class TestHost {}

function setup() {
  const fixture = TestBed.createComponent(TestHost);
  fixture.detectChanges();
  const card = fixture.nativeElement.querySelector('hlm-card') as HTMLElement;
  return { fixture, card };
}

describe('HlmCard', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('projects content and carries the surface base classes on the host', () => {
    const { card } = setup();
    expect(card.textContent).toContain('Filed against the bureau deadline.');
    expect(card.classList.contains('rounded-lg')).toBe(true);
    expect(card.classList.contains('bg-bg-2')).toBe(true);
    expect(card.classList.contains('text-ink')).toBe(true);
    expect(card.classList.contains('shadow-raised')).toBe(true);
    // The border must carry an explicit `border-line` colour: a bare
    // `border` would paint currentColor (Tailwind v4 has no default
    // border-color and this app has no global reset), giving a heavy border
    // instead of the subtle `--lw-line` role.
    expect(card.classList.contains('border')).toBe(true);
    expect(card.classList.contains('border-line')).toBe(true);
  });

  it('merges a consumer class with the surface base classes', () => {
    const { card } = setup();
    expect(card.classList.contains('w-80')).toBe(true);
    expect(card.classList.contains('rounded-lg')).toBe(true);
  });

  it('renders the header with its layout classes and projects its content', () => {
    const { card } = setup();
    const header = card.querySelector('hlm-card-header') as HTMLElement;
    expect(header).not.toBeNull();
    expect(header.classList.contains('grid')).toBe(true);
    expect(header.classList.contains('p-6')).toBe(true);
    expect(header.textContent).toContain('Story');
  });

  it('renders the title with its typography classes', () => {
    const { card } = setup();
    const title = card.querySelector('hlm-card-title') as HTMLElement;
    expect(title).not.toBeNull();
    expect(title.classList.contains('font-semibold')).toBe(true);
    expect(title.textContent?.trim()).toBe('Story');
  });

  it('renders the description with the muted-foreground class', () => {
    const { card } = setup();
    const desc = card.querySelector('hlm-card-description') as HTMLElement;
    expect(desc).not.toBeNull();
    expect(desc.getAttribute('data-slot')).toBe('card-description');
    expect(desc.classList.contains('text-ink-3')).toBe(true);
    expect(desc.textContent?.trim()).toBe('A draft awaiting review.');
  });

  it('renders the content with its padding classes and projects its content', () => {
    const { card } = setup();
    const content = card.querySelector('hlm-card-content') as HTMLElement;
    expect(content).not.toBeNull();
    expect(content.classList.contains('p-6')).toBe(true);
    expect(content.classList.contains('pt-0')).toBe(true);
    expect(content.textContent).toContain('Filed against the bureau deadline.');
  });

  it('renders the footer with its flex/padding classes and projects its content', () => {
    const { card } = setup();
    const footer = card.querySelector('hlm-card-footer') as HTMLElement;
    expect(footer).not.toBeNull();
    expect(footer.classList.contains('flex')).toBe(true);
    expect(footer.classList.contains('items-center')).toBe(true);
    expect(footer.textContent).toContain('Publish');
  });

  it('merges a consumer class on a sub-part via cn() (base + override survive)', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmCardContent],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-card-content class="text-sm">Body</hlm-card-content>`,
    })
    class ClassHost {}
    const fixture = TestBed.createComponent(ClassHost);
    fixture.detectChanges();
    const content = fixture.nativeElement.querySelector(
      'hlm-card-content',
    ) as HTMLElement;
    expect(content.classList.contains('text-sm')).toBe(true);
    expect(content.classList.contains('p-6')).toBe(true);
  });

  it('positions a card-action in the header grid via its data-slot', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmCardHeader, HlmCardTitle, HlmCardAction],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <hlm-card-header>
          <hlm-card-title>Story</hlm-card-title>
          <hlm-card-action><button type="button">Edit</button></hlm-card-action>
        </hlm-card-header>
      `,
    })
    class ActionHost {}
    const fixture = TestBed.createComponent(ActionHost);
    fixture.detectChanges();
    const action = fixture.nativeElement.querySelector(
      'hlm-card-action',
    ) as HTMLElement;
    expect(action.getAttribute('data-slot')).toBe('card-action');
    expect(action.classList.contains('col-start-2')).toBe(true);
    expect(action.classList.contains('justify-self-end')).toBe(true);
  });
});
