// Admin session token storage (issued by the `admin-auth` edge function).
// The token is a signed, expiring credential; the server re-validates it on every call.

const KEY = 'pa_admin_session';

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* storage unavailable: session lasts for this page only */
  }
}

export function clearAdminToken(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem('peptide_admin_auth'); // legacy client-only flag
  } catch {
    /* ignore */
  }
}
