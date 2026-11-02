// Shared HTTP helpers for protocol edge functions (Deno).
import { createClient } from "jsr:@supabase/supabase-js@2";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Service-role client. Bypasses RLS: only use after the caller is authenticated. */
export const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export const errorJson = (message: string, status = 400) => json({ error: message }, status);

export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const ea = new TextEncoder().encode(a ?? "");
  const eb = new TextEncoder().encode(b ?? "");
  if (ea.length !== eb.length || ea.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

const secretCache = new Map<string, string>();
/** Reads a `protocol_*` secret from Supabase Vault (cached per isolate). */
export async function getSecret(name: string): Promise<string | null> {
  if (secretCache.has(name)) return secretCache.get(name)!;
  const { data, error } = await admin.rpc("protocol_get_secret", { p_name: name });
  if (error) {
    console.error(`getSecret(${name}) failed:`, error.message);
    return null;
  }
  if (data) secretCache.set(name, data as string);
  return (data as string) ?? null;
}

/** Bearer-style session token sent by the browser in the `x-session-token` header. */
export const sessionTokenFrom = (req: Request) => req.headers.get("x-session-token");
