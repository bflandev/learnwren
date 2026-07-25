import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HlmPanel, HlmPanelBody, HlmPanelHeader } from './hlm-panel.component';

// Mirrors the card spec (Vitest globals + jsdom). A small host composes the
// full panel so we can assert each part carries its cn() base classes, projects
// its content, and that a consumer `class` merges on each surface.
@Component({
  standalone: true,
  imports: [HlmPanel, HlmPanelHeader, HlmPanelBody],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-panel class="w-80">
      <hlm-panel-header>Spaces</hlm-panel-header>
      <hlm-panel-body>No spaces yet.</hlm-panel-body>
    </hlm-panel>
  `,
})
class TestHost {}

function setup() {
  const fixture = TestBed.createComponent(TestHost);
  fixture.detectChanges();
  const panel = fixture.nativeElement.querySelector('hlm-panel') as HTMLElement;
  return { fixture, panel };
}

describe('HlmPanel', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('projects content and carries the shell base classes on the host', () => {
    const { panel } = setup();
    expect(panel.textContent).toContain('No spaces yet.');
    expect(panel.classList.contains('flex')).toBe(true);
    expect(panel.classList.contains('h-full')).toBe(true);
    expect(panel.classList.contains('min-h-0')).toBe(true);
    expect(panel.classList.contains('flex-col')).toBe(true);
    expect(panel.classList.contains('rounded-lg')).toBe(true);
    // A bare `border` would paint currentColor under Tailwind v4 (no default
    // border-color, no global reset), so the explicit subtle role is required.
    expect(panel.classList.contains('border')).toBe(true);
    expect(panel.classList.contains('border-line')).toBe(true);
    expect(panel.classList.contains('bg-bg-2')).toBe(true);
  });

  it('merges a consumer class with the shell base classes', () => {
    const { panel } = setup();
    expect(panel.classList.contains('w-80')).toBe(true);
    expect(panel.classList.contains('flex')).toBe(true);
  });

  it('renders the header with its layout classes and projects its content', () => {
    const { panel } = setup();
    const header = panel.querySelector('hlm-panel-header') as HTMLElement;
    expect(header).not.toBeNull();
    expect(header.classList.contains('flex')).toBe(true);
    expect(header.classList.contains('items-center')).toBe(true);
    expect(header.classList.contains('justify-between')).toBe(true);
    expect(header.classList.contains('border-b')).toBe(true);
    expect(header.classList.contains('border-line')).toBe(true);
    expect(header.textContent).toContain('Spaces');
  });

  it('renders the body as a scrollable block and projects its content', () => {
    const { panel } = setup();
    const body = panel.querySelector('hlm-panel-body') as HTMLElement;
    expect(body).not.toBeNull();
    expect(body.classList.contains('block')).toBe(true);
    expect(body.classList.contains('min-h-0')).toBe(true);
    expect(body.classList.contains('flex-1')).toBe(true);
    expect(body.classList.contains('overflow-y-auto')).toBe(true);
    expect(body.textContent).toContain('No spaces yet.');
  });

  it('lets a consumer override the body display via cn() (flex wins over block)', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmPanelBody],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-panel-body class="flex flex-col gap-4 p-4">Body</hlm-panel-body>`,
    })
    class ClassHost {}
    const fixture = TestBed.createComponent(ClassHost);
    fixture.detectChanges();
    const body = fixture.nativeElement.querySelector(
      'hlm-panel-body',
    ) as HTMLElement;
    expect(body.classList.contains('flex')).toBe(true);
    expect(body.classList.contains('flex-col')).toBe(true);
    expect(body.classList.contains('p-4')).toBe(true);
    // `block` from the base must be dropped — display is a single tailwind group.
    expect(body.classList.contains('block')).toBe(false);
    // Non-display base utilities survive the merge.
    expect(body.classList.contains('flex-1')).toBe(true);
    expect(body.classList.contains('overflow-y-auto')).toBe(true);
  });
});
