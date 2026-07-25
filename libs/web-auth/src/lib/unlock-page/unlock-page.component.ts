import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { HlmAlert } from '@learnwren/web-ui';

import { AuthService, type UnlockResult } from '../auth.service';

type UnlockState =
  | { kind: 'pending' }
  | { kind: 'ok' }
  | { kind: 'expired' }
  | { kind: 'invalid' }
  | { kind: 'error' };

@Component({
  selector: 'app-unlock-page',
  standalone: true,
  imports: [RouterLink, HlmAlert],
  templateUrl: './unlock-page.component.html',
})
export class UnlockPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly state = signal<UnlockState>({ kind: 'pending' });

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state.set({ kind: 'invalid' });
      return;
    }
    const result = await this.auth.unlock(token);
    this.state.set(this.toState(result));
  }

  private toState(result: UnlockResult): UnlockState {
    if (result.ok) return { kind: 'ok' };
    if (result.code === 'UNLOCK_TOKEN_EXPIRED') return { kind: 'expired' };
    if (result.code === 'INVALID_UNLOCK_TOKEN') return { kind: 'invalid' };
    return { kind: 'error' };
  }
}
