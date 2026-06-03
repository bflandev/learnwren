import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  AdminUserDetail,
  AdminUserListResponse,
  AdminUserRoleResponse,
} from '@learnwren/shared-data-models';

const BASE = '/api/admin/users';

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly http = inject(HttpClient);

  list(search: string, page: number, pageSize: number): Promise<AdminUserListResponse> {
    return firstValueFrom(
      this.http.get<AdminUserListResponse>(BASE, {
        params: { search, page: String(page), pageSize: String(pageSize) },
      }),
    );
  }

  getDetail(uid: string): Promise<AdminUserDetail> {
    return firstValueFrom(this.http.get<AdminUserDetail>(`${BASE}/${uid}`));
  }

  promote(uid: string): Promise<AdminUserRoleResponse> {
    return firstValueFrom(this.http.post<AdminUserRoleResponse>(`${BASE}/${uid}/promote`, {}));
  }

  demote(uid: string): Promise<AdminUserRoleResponse> {
    return firstValueFrom(this.http.post<AdminUserRoleResponse>(`${BASE}/${uid}/demote`, {}));
  }
}
