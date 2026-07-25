import { Injectable, type TemplateRef, signal } from '@angular/core';

/**
 * Global portal seam for the shell header's action area — the right side of the
 * header, before the user menu. A single owner at a time registers a
 * `TemplateRef` via `setContent`; the always-mounted `HeaderComponent` renders
 * `content()` through `ngTemplateOutlet`. Owners must `clear(theirTemplate)` on
 * destroy — the template-guarded overload prevents a late-destroyed owner from
 * wiping content a newer owner has already set.
 */
@Injectable({ providedIn: 'root' })
export class HeaderActionsService {
  private readonly _content = signal<TemplateRef<unknown> | null>(null);
  readonly content = this._content.asReadonly();

  setContent(template: TemplateRef<unknown>): void {
    this._content.set(template);
  }

  clear(template?: TemplateRef<unknown>): void {
    if (!template || this._content() === template) {
      this._content.set(null);
    }
  }
}
