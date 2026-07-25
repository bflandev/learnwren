import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfirmDialogService } from './confirm-dialog.service';

// Vitest globals + jsdom. The service mounts its container into a
// `@angular/cdk/dialog` overlay under `document.body`. There is no fixture, so
// CD is flushed manually via `ApplicationRef.tick()` + a macrotask (CDK overlay
// attach/detach lags a couple of macrotasks under jsdom, same as the dialog spec).
describe('ConfirmDialogService', () => {
  let service: ConfirmDialogService;
  let appRef: ApplicationRef;

  const purge = () => {
    document.body
      .querySelectorAll('.cdk-overlay-container')
      .forEach((n) => n.remove());
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConfirmDialogService);
    appRef = TestBed.inject(ApplicationRef);
    purge();
  });
  afterEach(purge);

  const flush = async () => {
    appRef.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const panel = () =>
    document.body.querySelector('hlm-confirm-dialog') as HTMLElement | null;
  const btn = (sel: string) =>
    document.body.querySelector(sel) as HTMLButtonElement;

  it('mounts an alertdialog panel with aria wiring and the message', async () => {
    const p = service.confirm({ header: 'Delete?', message: 'Cannot undo.' });
    await flush();
    const el = panel();
    expect(el).toBeTruthy();
    const container = el?.closest('[role="alertdialog"]') as HTMLElement | null;
    expect(container).toBeTruthy();
    const title = el?.querySelector('h2') as HTMLElement;
    const desc = el?.querySelector('p') as HTMLElement;
    expect(container?.getAttribute('aria-labelledby')).toBe(title.id);
    expect(container?.getAttribute('aria-describedby')).toBe(desc.id);
    expect(desc.textContent?.trim()).toBe('Cannot undo.');
    btn('[data-confirm-reject]').click();
    await expect(p).resolves.toBe(false);
  });

  it('resolves true and runs accept on confirm click', async () => {
    const accept = vi.fn();
    const p = service.confirm({ header: 'H', message: 'M', accept });
    await flush();
    btn('[data-confirm-accept]').click();
    await expect(p).resolves.toBe(true);
    expect(accept).toHaveBeenCalledOnce();
    await flush();
    expect(panel()).toBeNull();
  });

  it('resolves false and runs reject on cancel click', async () => {
    const reject = vi.fn();
    const p = service.confirm({ header: 'H', message: 'M', reject });
    await flush();
    btn('[data-confirm-reject]').click();
    await expect(p).resolves.toBe(false);
    expect(reject).toHaveBeenCalledOnce();
  });

  it('awaits an async accept (shows loading) before resolving true', async () => {
    let release!: () => void;
    const accept = vi.fn(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const p = service.confirm({ header: 'H', message: 'M', accept });
    await flush();
    btn('[data-confirm-accept]').click();
    await flush();
    expect(accept).toHaveBeenCalledOnce();
    // Still open with a spinner while the accept handler is pending.
    expect(panel()).toBeTruthy();
    expect(document.body.querySelector('hlm-spinner')).toBeTruthy();
    release();
    await expect(p).resolves.toBe(true);
    await flush();
    expect(panel()).toBeNull();
  });

  it('awaits a non-native thenable accept (shows loading) before resolving true', async () => {
    let release!: () => void;
    const thenable = {
      then: (onfulfilled?: ((value: void) => unknown) | null) => {
        release = () => onfulfilled?.();
        return Promise.resolve();
      },
    } as PromiseLike<void>;
    const accept = vi.fn(() => thenable);
    const p = service.confirm({ header: 'H', message: 'M', accept });
    await flush();
    btn('[data-confirm-accept]').click();
    await flush();
    expect(accept).toHaveBeenCalledOnce();
    // A PromiseLike is treated as async: dialog stays open with a spinner.
    expect(panel()).toBeTruthy();
    expect(document.body.querySelector('hlm-spinner')).toBeTruthy();
    release();
    await expect(p).resolves.toBe(true);
    await flush();
    expect(panel()).toBeNull();
  });

  it('applies the destructive variant + custom label to the confirm button', async () => {
    const p = service.confirm({
      header: 'H',
      message: 'M',
      variant: 'destructive',
      acceptLabel: 'Delete',
    });
    await flush();
    const accept = btn('[data-confirm-accept]');
    expect(accept.textContent?.trim()).toContain('Delete');
    expect(accept.className).toContain('bg-button-danger-bg');
    btn('[data-confirm-reject]').click();
    await p;
  });

  it('keeps the dialog open and clears loading when an async accept rejects', async () => {
    let rejectAccept!: (reason?: unknown) => void;
    const accept = vi.fn(
      () => new Promise<void>((_, rej) => (rejectAccept = rej)),
    );
    const p = service.confirm({ header: 'H', message: 'M', accept });
    await flush();
    btn('[data-confirm-accept]').click();
    await flush();
    expect(document.body.querySelector('hlm-spinner')).toBeTruthy();
    // The accept handler's promise rejects (its own concern). The dialog must
    // not close, must clear loading, and must not leave the service promise
    // resolved as `true` — and there must be no unhandled rejection.
    rejectAccept(new Error('boom'));
    await flush();
    expect(panel()).toBeTruthy();
    expect(document.body.querySelector('hlm-spinner')).toBeNull();
    // The user can still cancel, which resolves the service promise with false.
    btn('[data-confirm-reject]').click();
    await expect(p).resolves.toBe(false);
  });

  it('keeps the dialog open and clears loading when a synchronous accept throws', async () => {
    const accept = vi.fn(() => {
      throw new Error('boom');
    });
    const p = service.confirm({ header: 'H', message: 'M', accept });
    await flush();
    btn('[data-confirm-accept]').click();
    await flush();
    // A sync throw must be handled like an async rejection: dialog stays open,
    // no loading spinner, and close(true) must NOT fire.
    expect(accept).toHaveBeenCalledOnce();
    expect(panel()).toBeTruthy();
    expect(document.body.querySelector('hlm-spinner')).toBeNull();
    btn('[data-confirm-reject]').click();
    await expect(p).resolves.toBe(false);
  });

  it('resolves false when a dismissible dialog is closed via backdrop click', async () => {
    const p = service.confirm({
      header: 'H',
      message: 'M',
      dismissible: true,
    });
    await flush();
    expect(panel()).toBeTruthy();
    const backdrop = document.body.querySelector(
      '.cdk-overlay-backdrop',
    ) as HTMLElement | null;
    expect(backdrop).toBeTruthy();
    backdrop?.click();
    await expect(p).resolves.toBe(false);
    await flush();
    expect(panel()).toBeNull();
  });

  it('paints the surface-only panel base on the container host', async () => {
    const p = service.confirm({ header: 'H', message: 'M' });
    await flush();
    const el = panel() as HTMLElement;
    for (const cls of [
      'grid',
      'w-full',
      'max-w-lg',
      'gap-4',
      'rounded-lg',
      'border-dialog',
      'bg-dialog',
      'shadow-dialog',
    ]) {
      expect(el.classList.contains(cls), `panel ${cls}`).toBe(true);
    }
    btn('[data-confirm-reject]').click();
    await p;
  });

  it('mints sequential, well-formed aria ids per confirm() call', async () => {
    const p = service.confirm({ header: 'H', message: 'M' });
    await flush();
    const el = panel() as HTMLElement;
    const title = el.querySelector('h2') as HTMLElement;
    const desc = el.querySelector('p') as HTMLElement;
    expect(title.id).toMatch(/^lw-confirm-title-\d+$/);
    expect(desc.id).toMatch(/^lw-confirm-desc-\d+$/);
    btn('[data-confirm-reject]').click();
    await p;
  });

  it('tags the backdrop with the app scrim class', async () => {
    const p = service.confirm({ header: 'H', message: 'M' });
    await flush();
    const backdrop = document.body.querySelector(
      '.cdk-overlay-backdrop',
    ) as HTMLElement | null;
    expect(backdrop).toBeTruthy();
    expect(backdrop?.classList.contains('lw-dialog-backdrop')).toBe(true);
    btn('[data-confirm-reject]').click();
    await p;
  });

  it('ignores Escape while non-dismissible (modal by default)', async () => {
    const p = service.confirm({ header: 'H', message: 'M' });
    await flush();
    const pane = document.body.querySelector(
      '.cdk-overlay-pane',
    ) as HTMLElement | null;
    expect(pane).toBeTruthy();
    pane?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await flush();
    expect(panel()).toBeTruthy(); // still open — Esc is inert
    btn('[data-confirm-reject]').click();
    await expect(p).resolves.toBe(false);
  });

  it('resolves true even when no accept callback is configured', async () => {
    const p = service.confirm({ header: 'H', message: 'M' });
    await flush();
    btn('[data-confirm-accept]').click();
    await expect(p).resolves.toBe(true);
  });

  it('closes synchronously for a synchronous accept (no loading detour)', async () => {
    const accept = vi.fn();
    const p = service.confirm({ header: 'H', message: 'M', accept });
    await flush();
    const container = panel();
    btn('[data-confirm-accept]').click();
    // No thenable returned → the handler must reach close(true) inside the
    // click turn, without parking on an await first.
    expect(
      container?.closest('.cdk-overlay-pane')?.isConnected ?? false,
    ).toBe(false);
    await expect(p).resolves.toBe(true);
  });

  it('focuses the safe (cancel) action initially and restores focus on close', async () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    const p = service.confirm({ header: 'H', message: 'M' });
    await flush();
    await flush();
    expect(
      (document.activeElement as HTMLElement | null)?.getAttribute(
        'data-confirm-reject',
      ),
    ).not.toBeNull();
    btn('[data-confirm-reject]').click();
    await p;
    await flush();
    await flush();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('renders an icon when provided in the data', async () => {
    const p = service.confirm({
      header: 'Delete',
      message: 'Are you sure?',
      icon: 'lucideTrash',
    });
    await flush();
    const el = panel();
    const icon = el?.querySelector('hlm-icon') as HTMLElement | null;
    expect(icon).toBeTruthy();
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    btn('[data-confirm-reject]').click();
    await p;
  });

  it('prevents re-entrancy when accept is clicked twice before CD flush', async () => {
    let calls = 0;
    const accept = vi.fn(() => {
      calls++;
      return new Promise<void>((resolve) => setTimeout(resolve, 100));
    });
    const p = service.confirm({ header: 'H', message: 'M', accept });
    await flush();
    const acceptBtn = btn('[data-confirm-accept]');
    acceptBtn.click();
    acceptBtn.click(); // second click before flush
    await flush();
    // The re-entrancy guard must prevent the second click from running accept again.
    expect(calls).toBe(1);
    await expect(p).resolves.toBe(true);
  });
});
