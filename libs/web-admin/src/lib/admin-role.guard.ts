import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';

export const adminRoleGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.currentUser() === undefined) {
    try {
      await auth.refresh();
    } catch {
      // Non-401 refresh failure (e.g. 500 / network): leave currentUser
      // undefined and fall through to the login redirect below instead of
      // crashing navigation. 401 is already handled inside refresh().
    }
  }

  const user = auth.currentUser();
  if (!user) {
    return router.createUrlTree(['/login'], {
      queryParams: { redirect: state.url },
    });
  }
  if (user.role !== 'ADMIN') {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};
