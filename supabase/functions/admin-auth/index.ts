// admin-auth: server-side admin login for the dashboard.
//
// Deploy with `verify_jwt = false` (the browser sends the anon key, not a user JWT; this function does its
// own auth with the password and a signed session token in the `x-session-token` header).
//
// Actions (POST JSON):
//   { action: 'login', password }                 -> { token, must_rotate, expires_at }
//   { action: 'change_password', current, next }  -> { token, must_rotate: false, expires_at }  (admin token required)
//   { action: 'verify' }                          -> { valid, must_rotate }
//
// Passwords are never logged.
import { admin, errorJson, json, preflight, readJson, sessionTokenFrom } from "../_shared/http.ts";
import { requireAdmin, signToken } from "../_shared/session.ts";

const ADMIN_SESSION_HOURS = 12;
const MAX_PASSWORD_LENGTH = 200;

// --- brute-force slowdown (per isolate, best effort) -------------------------------------------------------
const failures = new Map<string, { count: number; last: number }>();
const clientKey = (req: Request) =>
  (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";

async function failureDelay(req: Request): Promise<void> {
  const key = clientKey(req);
  const now = Date.now();
  const prev = failures.get(key);
  const count = prev && now - prev.last < 15 * 60_000 ? prev.count + 1 : 1;
  failures.set(key, { count, last: now });
  if (failures.size > 5000) failures.clear();
  const ms = Math.min(800 * 2 ** Math.min(count - 1, 3), 6000) + Math.floor(Math.random() * 300);
  await new Promise((r) => setTimeout(r, ms));
}
const clearFailures = (req: Request) => failures.delete(clientKey(req));

const validPassword = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= MAX_PASSWORD_LENGTH;

async function checkAdminPassword(password: string): Promise<number | null> {
  const { data, error } = await admin.rpc("protocol_check_password", { p_kind: "admin", p_password: password });
  if (error) {
    console.error("admin-auth: protocol_check_password failed:", error.message);
    throw new Error("Auth check failed");
  }
  return typeof data === "number" ? data : null;
}

async function mustRotate(): Promise<boolean> {
  const { data } = await admin.from("admin_credentials").select("must_rotate").eq("id", true).maybeSingle();
  return data?.must_rotate ?? true;
}

async function issue(pv: number, rotate: boolean) {
  const token = await signToken("admin", pv, ADMIN_SESSION_HOURS);
  const expires_at = new Date(Date.now() + ADMIN_SESSION_HOURS * 3600_000).toISOString();
  return { token, must_rotate: rotate, expires_at };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return errorJson("Method not allowed", 405);

  const body = await readJson<Record<string, unknown>>(req);
  const action = body.action;

  try {
    if (action === "login") {
      if (!validPassword(body.password)) {
        await failureDelay(req);
        return errorJson("Invalid password", 401);
      }
      const pv = await checkAdminPassword(body.password);
      if (pv === null) {
        await failureDelay(req);
        return errorJson("Invalid password", 401);
      }
      clearFailures(req);
      return json(await issue(pv, await mustRotate()));
    }

    if (action === "change_password") {
      const session = await requireAdmin(sessionTokenFrom(req));
      if (!session) return errorJson("Session expired. Please log in again.", 401);

      const { current, next } = body;
      if (!validPassword(current)) {
        await failureDelay(req);
        return errorJson("Current password is incorrect", 403);
      }
      if (typeof next !== "string" || next.length < 8) {
        return errorJson("New password must be at least 8 characters", 400);
      }
      if (next.length > MAX_PASSWORD_LENGTH) return errorJson("New password is too long", 400);
      if (next === current) return errorJson("New password must be different from the current one", 400);

      const pv = await checkAdminPassword(current);
      if (pv === null) {
        await failureDelay(req);
        return errorJson("Current password is incorrect", 403);
      }
      clearFailures(req);

      const { data: newPv, error } = await admin.rpc("protocol_set_password", { p_kind: "admin", p_password: next });
      if (error || typeof newPv !== "number") {
        console.error("admin-auth: protocol_set_password failed:", error?.message);
        return errorJson("Could not change password", 500);
      }
      return json(await issue(newPv, false));
    }

    if (action === "verify") {
      const session = await requireAdmin(sessionTokenFrom(req));
      if (!session) return json({ valid: false, must_rotate: false });
      return json({ valid: true, must_rotate: await mustRotate() });
    }

    return errorJson("Unknown action", 400);
  } catch (err) {
    console.error("admin-auth error:", err instanceof Error ? err.message : "unknown");
    return errorJson("Server error", 500);
  }
});
