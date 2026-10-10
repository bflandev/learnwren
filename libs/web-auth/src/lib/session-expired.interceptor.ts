import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

const HTTP_UNAUTHORIZED = 401;

/**
 * A session can end while the SPA is open (cookie expiry, an admin
 * suspend/demote/delete, a password or email change on another device). The
 * guards trust the cached user, so without this every page kept the stale
 * header and showed a "Try again" that could never work. On a 401 from any
 * api call while we think someone is signed in, drop the cached user and send
 * them to log in, returning here afterwards. /api/auth/* is exempt: login and
 * /me report their own 401s. Wrong-password re-auth errors are 400s, so a 401
 * here always means the session is gone.
 */
export const sessionExpiredInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return next(req).pipe(
    catchError((err: unknown) => {
      const sessionGone =
        err instanceof HttpErrorResponse &&
        err.status === HTTP_UNAUTHORIZED &&
        !req.url.startsWith('/api/auth/') &&
        Boolean(auth.currentUser());
      if (sessionGone) {
        auth.clearSession();
        void router.navigate(['/login'], { queryParams: { redirect: router.url } });
      }
      return throwError(() => err);
    }),
  );
};
