import crypto from 'crypto';

// Random API token — generated fresh on every app start
// Only the Electron renderer and overlays know this token
let apiToken: string = '';

export function generateApiToken(): string {
  apiToken = crypto.randomBytes(32).toString('hex');
  console.log(`[Auth] API token generated`);
  return apiToken;
}

export function getApiToken(): string {
  return apiToken;
}

export function validateApiToken(token: string | undefined): boolean {
  if (!apiToken) return true; // Not initialized yet
  return token === apiToken;
}
