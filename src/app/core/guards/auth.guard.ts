import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { filter, map, switchMap, take } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  
  // Wait for auth to be fully initialized before checking isAuthenticated
  return auth.isInitialized$.pipe(
    filter(initialized => initialized),
    take(1),
    map(() => {
      if (auth.isAuthenticated()) return true;
      auth.login();
      return false;
    })
  );
};

export const contributorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  
  return auth.isInitialized$.pipe(
    filter(initialized => initialized),
    take(1),
    map(() => {
      if (auth.isContributor()) return true;
      return router.createUrlTree(['/dag']);
    })
  );
};
