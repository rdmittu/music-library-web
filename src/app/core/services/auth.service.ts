import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { User } from '../models/api.models';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, Observable, map, take, tap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly oidcSecurityService = inject(OidcSecurityService);

  private readonly _accessToken = signal<string | null>(null);
  private readonly _user = signal<User | null>(null);
  private readonly _isInitialized$ = new BehaviorSubject<boolean>(false);

  readonly accessToken = this._accessToken.asReadonly();
  readonly currentUser = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._accessToken() !== null);
  readonly isAdmin = computed(() => this._user()?.role === 'admin');
  readonly isContributor = computed(() => ['admin', 'contributor'].includes(this._user()?.role ?? ''));
  readonly isInitialized$ = this._isInitialized$.asObservable();

  /** Called on app init to restore session */
  init(): Observable<boolean> {
    const url = new URL(window.location.href);
    const isCallback = url.searchParams.has('code') || url.searchParams.has('error');

    if (isCallback) {
      return this.oidcSecurityService.checkAuth().pipe(
        take(1),
        tap((result) => {
          const { isAuthenticated, userData, accessToken } = result;
          if (isAuthenticated && userData) {
            this._accessToken.set(accessToken);
            this._user.set({ 
              userId: userData.sub, 
              role: userData['custom:role'] || 'admin' 
            });
            // Clean the URL without full navigation
            window.history.replaceState({}, '', window.location.origin + window.location.pathname);
          }
          this._isInitialized$.next(true);
        }),
        map(() => true)
      );
    }

    // Normal load
    return this.oidcSecurityService.isAuthenticated$.pipe(
      take(1),
      tap(({ isAuthenticated }) => {
        if (isAuthenticated) {
          this.oidcSecurityService.getAccessToken().subscribe(token => this._accessToken.set(token));
          this.oidcSecurityService.userData$.subscribe(({ userData }) => {
            if (userData) {
              this._user.set({
                userId: userData.sub,
                role: userData['custom:role'] || 'admin'
              });
            }
          });
        }
        this._isInitialized$.next(true);
      }),
      map(() => true)
    );
  }

  async login(): Promise<void> {
    this.oidcSecurityService.authorize();
  }

  async register(): Promise<void> {
    this.oidcSecurityService.authorize();
  }

  async logout(): Promise<void> {
    this.oidcSecurityService.logoff().subscribe(() => {
      this.clearSession();
      // Cognito logout requires a redirect to the cognito domain logout endpoint for full cleanup
      window.location.href = `https://${environment.cognitoDomain}/logout?client_id=${environment.cognitoClientId}&logout_uri=${window.location.origin}/`;
    });
  }

  /** OIDC client handles refresh automatically */
  async refreshToken(): Promise<string | null> {
    return this.accessToken();
  }

  setAccessToken(token: string): void {
    this._accessToken.set(token);
  }

  private clearSession(): void {
    this._accessToken.set(null);
    this._user.set(null);
  }
}
