import { JsonPipe } from '@angular/common';
import { Component, inject, isDevMode, signal } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';

interface SmokeResult {
  docId: string;
  writtenAt: string;
  readBack: unknown;
}

@Component({
  selector: 'app-firestore-smoke',
  standalone: true,
  imports: [JsonPipe],
  template: `
    @if (devMode) {
      <details class="mt-6 max-w-xl mx-auto rounded border border-slate-200 bg-white p-4 text-slate-900">
        <summary class="cursor-pointer font-semibold">Dev tools</summary>
        <div class="mt-3 space-y-3">
          <button
            type="button"
            class="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            [disabled]="busy()"
            (click)="run()">
            Run Firestore smoke
          </button>
          @if (error()) {
            <pre class="text-sm text-red-700">{{ error() }}</pre>
          }
          @if (result(); as r) {
            <pre class="overflow-x-auto rounded bg-slate-100 p-2 text-xs">{{ r | json }}</pre>
          }
        </div>
      </details>
    }
  `,
})
export class FirestoreSmokeComponent {
  private readonly firestore = inject(Firestore);

  protected readonly devMode = isDevMode();
  protected readonly busy = signal(false);
  protected readonly result = signal<SmokeResult | null>(null);
  protected readonly error = signal<string | null>(null);

  async run(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const docId = String(Date.now());
      const ref = doc(this.firestore, '_smoke', docId);
      const writtenAt = new Date().toISOString();
      await setDoc(ref, { writtenAt, serverTimestamp: serverTimestamp() });
      const snap = await getDoc(ref);
      this.result.set({ docId, writtenAt, readBack: snap.data() ?? null });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }
}
