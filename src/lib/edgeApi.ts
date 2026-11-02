// Thin client for the protocol edge functions (admin-auth, protocol-admin, protocol-portal,
// protocol-delivery). Session tokens travel in the `x-session-token` header.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export class EdgeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function callEdge<T = unknown>(
  fn: string,
  body: Record<string, unknown>,
  opts: { token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
  if (opts.token) headers['x-session-token'] = opts.token;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new EdgeError((data as { error?: string }).error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}
