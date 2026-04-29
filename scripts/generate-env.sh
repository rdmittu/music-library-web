#!/bin/bash
cat > src/environments/environment.ts << EOF
export const environment = {
  production: true,
  apiUrl: '${API_URL}',
  cognitoUserPoolId: '${COGNITO_USER_POOL_ID}',
  cognitoClientId: '${COGNITO_CLIENT_ID}',
  cognitoDomain: '${COGNITO_DOMAIN}',
  redirectUrl: '${REDIRECT_URL}',
};
EOF
