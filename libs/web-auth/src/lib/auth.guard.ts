import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.currentUser() === undefined) {
    await auth.refresh();
  }
  if (auth.currentUser() === null) {
    return router.createUrlTree(['/login'], {
      queryParams: { redirect: state.url },
    });
  }
  return true;
};
