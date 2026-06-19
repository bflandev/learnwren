import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';

/**
 * The landing page is for logged-out visitors. Authenticated users are sent to
 * their dashboard. When the session has not yet resolved (currentUser ===
 * undefined on a fresh load), refresh once before deciding.
 *
 * The landing page is the public front door, so a failed session refresh must
 * never blank it: AuthService.refresh() only swallows a 401 and re-throws every
 * other error (api 5xx, cold start, network blip), which would otherwise reject
 * this guard and fail route activation. Catch any such failure and treat the
 * session as anonymous — render the page rather than break it.
 */
export const landingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.currentUser() === undefined) {
    try {
      await auth.refresh();
    } catch {
      // Unresolvable session → treat as anonymous and show the public landing.
    }
  }

  return auth.isAuthenticated() ? router.createUrlTree(['/dashboard']) : true;
};
