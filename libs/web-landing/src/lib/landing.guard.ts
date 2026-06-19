import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';

/**
 * The landing page is for logged-out visitors. Authenticated users are sent to
 * their dashboard. When the session has not yet resolved (currentUser ===
 * undefined on a fresh load), refresh once before deciding — mirrors authGuard.
 */
export const landingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.currentUser() === undefined) {
    await auth.refresh();
  }

  return auth.isAuthenticated() ? router.createUrlTree(['/dashboard']) : true;
};
