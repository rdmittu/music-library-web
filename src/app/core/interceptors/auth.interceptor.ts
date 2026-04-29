import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { from } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

// Shared refresh promise to prevent multiple simultaneous refresh calls
let refreshPromise: Promise<string | null> | null = null;

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // ONLY add auth headers to requests going to our API
  // Do NOT add them to S3 requests (amazonaws.com) or other external resources
  const isApiRequest = req.url.includes('execute-api') || req.url.includes('localhost:3000');
  if (!isApiRequest) return next(req);

  // Don't add auth headers to refresh/login/register
  const isAuthRoute = req.url.includes('/auth/refresh') || req.url.includes('/auth/login') || req.url.includes('/auth/register');
  if (isAuthRoute) return next(req);

  const token = auth.accessToken();
  const authedReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authedReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401) return throwError(() => err);

      // Token expired — attempt refresh
      if (!refreshPromise) {
        refreshPromise = auth.refreshToken().finally(() => { refreshPromise = null; });
      }

      return from(refreshPromise).pipe(
        switchMap((newToken) => {
          if (!newToken) {
            router.navigate(['/login']);
            return throwError(() => err);
          }
          const retried = req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } });
          return next(retried);
        })
      );
    })
  );
};
