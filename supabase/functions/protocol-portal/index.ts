// protocol-portal: the password lock in front of the public /protocols page.
//
// Deploy with `verify_jwt = false` (the browser sends the anon key; this function checks the portal password
// and its own signed session token from the `x-session-token` header).
//
// Actions (POST JSON):
//   { action: 'unlock', password } -> { token, expires_at }        (portal session, `session_hours` TTL)
//   { action: 'redeem', token }    -> { token, expires_at }        (one-click link token from a protocol email)
//   { action: 'list' }             -> { protocols, expires_at }    (portal or admin token; 401 when invalid/expired)
//
// File/image protocols stored in the private `protocol-files` bucket are returned with a 1-hour signed URL
// in `file_url`. Passwords are never logged.
import { admin, errorJson, json, preflight, readJson, sessionTokenFrom } from "../_shared/http.ts";
import { signToken, verifyToken } from "../_shared/session.ts";

const BUCKET = "protocol-files";
const SIGNED_URL_SECONDS = 3600;
const GENERIC_ERROR = "Incorrect password";

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

const PUBLIC_COLUMNS =
  "id, name, category, dosage, frequency, duration, notes, storage, sort_order, active, content_type, file_url, file_path, version, created_at, updated_at";

async function issueSession(pv: number): Promise<Response> {
  const { data: settings } = await admin
    .from("protocol_portal_settings")
    .select("session_hours")
    .eq("id", true)
    .maybeSingle();
  const hours = settings?.session_hours ?? 720;
  const token = await signToken("portal", pv, hours);
  return json({ token, expires_at: new Date(Date.now() + hours * 3600_000).toISOString() });
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return errorJson("Method not allowed", 405);

  const body = await readJson<Record<string, unknown>>(req);

  try {
    if (body.action === "unlock") {
      const pw = body.password;
      if (typeof pw !== "string" || !pw || pw.length > 200) {
        await failureDelay(req);
        return errorJson(GENERIC_ERROR, 401);
      }
      const { data: pv, error } = await admin.rpc("protocol_check_password", { p_kind: "portal", p_password: pw });
      if (error) {
        console.error("protocol-portal: password check failed:", error.message);
        return errorJson("Server error", 500);
      }
      if (typeof pv !== "number") {
        await failureDelay(req);
        return errorJson(GENERIC_ERROR, 401);
      }
      failures.delete(clientKey(req));
      return issueSession(pv);
    }

    if (body.action === "redeem") {
      // One-click link from a protocol email. The link token is signed with the portal password version,
      // so changing the portal password also disables every link already sent.
      const link = typeof body.token === "string" && body.token.length <= 1000
        ? await verifyToken(body.token, "portal_link")
        : null;
      if (!link) {
        await failureDelay(req);
        return errorJson("This link has expired. Please enter the password.", 401);
      }
      return issueSession(link.pv);
    }

    if (body.action === "list") {
      const session = await verifyToken(sessionTokenFrom(req), "portal");
      if (!session) return errorJson("Session expired", 401);
      if (session.role === "admin") {
        // An admin token whose password is still the public seed must not open the portal.
        const { data: cred } = await admin.from("admin_credentials").select("must_rotate").eq("id", true).maybeSingle();
        if (cred?.must_rotate !== false) return errorJson("Session expired", 401);
      }

      const { data, error } = await admin
        .from("protocols")
        .select(PUBLIC_COLUMNS)
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];

      const paths = rows.map((r) => r.file_path).filter((p): p is string => typeof p === "string" && !!p);
      const signed = new Map<string, string>();
      if (paths.length) {
        const { data: urls } = await admin.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
        for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
      }

      const protocols = rows.map(({ file_path, file_url, ...rest }) => ({
        ...rest,
        // Private file -> signed URL. Legacy externally hosted file (no file_path) -> stored URL.
        // A legacy *public Supabase* URL no longer works once the bucket is private, so never return it.
        file_url: file_path
          ? signed.get(file_path) ?? null
          : typeof file_url === "string" && !file_url.includes("/storage/v1/object/public/")
          ? file_url
          : null,
      }));

      return json({ protocols, expires_at: new Date(session.exp * 1000).toISOString() });
    }

    return errorJson("Unknown action", 400);
  } catch (err) {
    console.error("protocol-portal error:", err instanceof Error ? err.message : "unknown");
    return errorJson("Server error", 500);
  }
});
