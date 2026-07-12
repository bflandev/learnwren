import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const loginRedirect = () =>
    router.createUrlTree(['/login'], {
      queryParams: { redirect: state.url },
    });

  if (auth.currentUser() === undefined) {
    try {
      await auth.refresh();
    } catch {
      // Non-401 refresh failure (e.g. 500 / network): treat the user as
      // unauthenticated instead of crashing navigation. 401 is already
      // handled inside refresh() (it resolves with currentUser = null).
      return loginRedirect();
    }
  }
  if (auth.currentUser() === null) {
    return loginRedirect();
  }
  return true;
};
