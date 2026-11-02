// Stateless signed session tokens for the admin dashboard and the protocol portal.
//
// Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, protocol_session_secret))
// Payload: { role: 'admin' | 'portal', pv: password_version, exp: unix seconds }
// Changing a password bumps password_version, which invalidates every token issued before it.
import { admin, getSecret } from "./http.ts";

export type Role = "admin" | "portal";
export interface SessionPayload {
  role: Role;
  pv: number;
  exp: number;
}

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmacKey(): Promise<CryptoKey> {
  const secret = await getSecret("protocol_session_secret");
  if (!secret) throw new Error("protocol_session_secret is not configured in Vault");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signToken(role: Role, passwordVersion: number, ttlHours: number): Promise<string> {
  const payload: SessionPayload = { role, pv: passwordVersion, exp: Math.floor(Date.now() / 1000) + ttlHours * 3600 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

async function currentPasswordVersion(role: Role): Promise<number | null> {
  const table = role === "admin" ? "admin_credentials" : "protocol_portal_settings";
  const { data } = await admin.from(table).select("password_version").eq("id", true).maybeSingle();
  return data?.password_version ?? null;
}

/**
 * Verifies a token for the given role. Returns the payload or null.
 * An admin token is also accepted where a portal token is required (admins can preview the portal).
 */
export async function verifyToken(token: string | null, role: Role): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.role !== role && !(role === "portal" && payload.role === "admin")) return null;
    const pv = await currentPasswordVersion(payload.role);
    if (pv === null || pv !== payload.pv) return null;
    return payload;
  } catch {
    return null;
  }
}

export const requireAdmin = (token: string | null) => verifyToken(token, "admin");
