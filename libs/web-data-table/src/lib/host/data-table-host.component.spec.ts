import { Component, inject, viewChildren } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DataTableSidebarComponent } from '../sidebar/data-table-sidebar.component';
import { DataTableStateService } from '../state/data-table-state.service';
import { DataTableHostComponent } from './data-table-host.component';

@Component({
  selector: 'lw-host-probe',
  standalone: true,
  template: `<span>{{ id }}</span>`,
})
class ProbeComponent {
  readonly state = inject(DataTableStateService);
  id = Math.random();
}

@Component({
  standalone: true,
  imports: [DataTableHostComponent, ProbeComponent],
  template: `
    <lw-data-table-host><lw-host-probe /></lw-data-table-host>
    <lw-data-table-host><lw-host-probe /></lw-data-table-host>
  `,
})
class TwoHostsHarness {
  readonly probes = viewChildren(ProbeComponent);
}

describe('DataTableHostComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('provides a DataTableStateService instance per host element', () => {
    TestBed.configureTestingModule({ imports: [TwoHostsHarness] });
    const fixture = TestBed.createComponent(TwoHostsHarness);
    fixture.detectChanges();
    const [a, b] = fixture.componentInstance.probes();
    expect(a.state).toBeInstanceOf(DataTableStateService);
    expect(b.state).toBeInstanceOf(DataTableStateService);
    expect(a.state).not.toBe(b.state);
  });

  it('mutations on one host do not leak to the other', () => {
    TestBed.configureTestingModule({ imports: [TwoHostsHarness] });
    const fixture = TestBed.createComponent(TwoHostsHarness);
    fixture.detectChanges();
    const [a, b] = fixture.componentInstance.probes();
    a.state.setColumnsFilter('abc');
    expect(a.state.columnsFilter()).toBe('abc');
    expect(b.state.columnsFilter()).toBe('');
  });
});

function makeStorageMock(): Storage {
  const store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    getItem: (k: string) => (k in store ? store[k] : null),
    key: (i: number) => Object.keys(store)[i] ?? null,
    removeItem: (k: string) => {
      delete store[k];
    },
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
  };
}

@Component({
  standalone: true,
  imports: [DataTableHostComponent, DataTableSidebarComponent, ProbeComponent],
  template: `
    <lw-data-table-host>
      <lw-data-table-sidebar [spaceId]="'s'" />
      <lw-host-probe />
      <lw-data-table-sidebar [spaceId]="'s'" side="right" />
    </lw-data-table-host>
  `,
})
class RailHarness {}

describe('DataTableHostComponent (rail layout)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorageMock());
    TestBed.resetTestingModule();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('projects default content into .data-table-host__main', () => {
    TestBed.configureTestingModule({ imports: [RailHarness] });
    const fixture = TestBed.createComponent(RailHarness);
    fixture.detectChanges();
    const main = fixture.nativeElement.querySelector(
      '.data-table-host__main',
    ) as HTMLElement;
    expect(main.querySelector('lw-host-probe')).not.toBeNull();
  });

  it('projects a default sidebar before main and a right sidebar after', () => {
    TestBed.configureTestingModule({ imports: [RailHarness] });
    const fixture = TestBed.createComponent(RailHarness);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('lw-data-table-host');
    const main = host.querySelector('.data-table-host__main') as HTMLElement;
    const sidebars = host.querySelectorAll('lw-data-table-sidebar');
    const left = Array.from(sidebars).find(
      (s) => (s as HTMLElement).getAttribute('side') !== 'right',
    ) as HTMLElement;
    const right = host.querySelector(
      'lw-data-table-sidebar[side="right"]',
    ) as HTMLElement;
    expect(
      main.compareDocumentPosition(left) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(
      main.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
