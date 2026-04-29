import { ApplicationConfig, provideBrowserGlobalErrorListeners, APP_INITIALIZER } from '@angular/core';
import { provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAuth } from 'angular-auth-oidc-client';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';
import { environment } from '../environments/environment';

function initAuth(auth: AuthService) {
  return () => auth.init();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAuth({
      config: {
        configId: 'cognito',
        authority: `https://cognito-idp.us-east-2.amazonaws.com/${environment.cognitoUserPoolId}`,
        redirectUrl: environment.redirectUrl,
        postLogoutRedirectUri: environment.redirectUrl,
        clientId: environment.cognitoClientId,
        scope: 'openid email profile aws.cognito.signin.user.admin',
        responseType: 'code',
        silentRenew: true,
        useRefreshToken: true,
        logLevel: environment.production ? 1 : 0,
        renewTimeBeforeTokenExpiresInSeconds: 30,
      },
    }),
    {
      provide: APP_INITIALIZER,
      useFactory: initAuth,
      deps: [AuthService],
      multi: true,
    },
  ],
};
