// Copy this file to environment.ts (dev) and environment.prod.ts (prod) and fill in real values.
// Neither of those files should ever be committed to source control.
export const environment = {
  production: false,
  apiUrl: 'https://YOUR_API_GATEWAY_ID.execute-api.YOUR_REGION.amazonaws.com/api',
  cognitoUserPoolId: 'YOUR_REGION_YOUR_POOL_ID',
  cognitoClientId: 'YOUR_COGNITO_CLIENT_ID',
  cognitoDomain: 'YOUR_POOL_ID.auth.YOUR_REGION.amazoncognito.com',
  redirectUrl: 'http://localhost:4200/',
};
