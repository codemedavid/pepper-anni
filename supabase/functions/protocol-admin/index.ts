// protocol-admin: protocol CRUD, product assignment, portal password and private file uploads.
//
// Deploy with `verify_jwt = false` (the browser sends the anon key; this function authenticates the admin
// session token from the `x-session-token` header itself). Every action requires a valid admin token, and
// is refused while the admin password still has to be rotated (the seeded password is public).
//
// Actions (POST JSON):
//   list                                        -> { protocols: [...with product_ids, signed_url] }
//   create { protocol, product_ids? }           -> { protocol }
//   update { id, updates }                      -> { protocol }
//   delete { id }                               -> { success }
//   toggle_active { id, active }                -> { protocol }
//   set_assignments { protocol_id, product_ids } -> { product_ids }
//   create_upload_url { filename, content_type } -> { path, token, signed_url }
//   file_url { path }                           -> { url }   (10 minutes)
//   get_portal_settings                         -> { has_password, password, updated_at, session_hours }
//   set_portal_password { password }            -> { password_version, updated_at }  (logs out all portal sessions)
import { admin, errorJson, json, preflight, readJson, sessionTokenFrom } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/session.ts";

const BUCKET = "protocol-files";
const PREVIEW_URL_SECONDS = 3600;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

const CONTENT_TYPES = new Set(["text", "file", "image"]);
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "txt", "xls", "xlsx",
  "jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "heic", "heif", "avif", "jfif",
]);
// Safe object path produced by create_upload_url (no traversal, no folders).
const PATH_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

type Row = Record<string, unknown>;

/** Whitelist + validate writable protocol columns. Returns [clean, error]. */
function sanitizeProtocol(input: unknown, partial: boolean): [Row, string | null] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [{}, "Invalid protocol payload"];
  const src = input as Row;
  const out: Row = {};
  const str = (k: string, max: number, required = false) => {
    if (!(k in src)) {
      if (required && !partial) throw new Error(`${k} is required`);
      return;
    }
    const v = src[k] ?? "";
    if (typeof v !== "string") throw new Error(`${k} must be text`);
    if (v.length > max) throw new Error(`${k} is too long`);
    if (required && !v.trim()) throw new Error(`${k} is required`);
    out[k] = v;
  };
  try {
    str("name", 200, true);
    str("category", 200, true);
    str("dosage", 2000);
    str("frequency", 2000);
    str("duration", 2000);
    str("storage", 2000);
    if ("notes" in src) {
      const n = src.notes ?? [];
      if (!Array.isArray(n) || n.some((x) => typeof x !== "string") || n.length > 100) {
        throw new Error("notes must be a list of text");
      }
      out.notes = (n as string[]).map((x) => x.slice(0, 2000));
    }
    if ("sort_order" in src) {
      const s = Number(src.sort_order);
      if (!Number.isFinite(s)) throw new Error("sort_order must be a number");
      out.sort_order = Math.trunc(s);
    }
    if ("active" in src) {
      if (typeof src.active !== "boolean") throw new Error("active must be true/false");
      out.active = src.active;
    }
    if ("content_type" in src) {
      if (!CONTENT_TYPES.has(String(src.content_type))) throw new Error("Invalid content_type");
      out.content_type = src.content_type;
    }
    if ("file_path" in src) {
      const p = src.file_path;
      if (p !== null && (typeof p !== "string" || !PATH_RE.test(p))) throw new Error("Invalid file_path");
      out.file_path = p;
    }
    if ("file_url" in src) {
      const u = src.file_url;
      if (u !== null && (typeof u !== "string" || !/^https:\/\//.test(u) || u.length > 2000)) {
        throw new Error("Invalid file_url");
      }
      out.file_url = u;
    }
    if ("product_id" in src) {
      const p = src.product_id;
      if (p !== null && p !== undefined && !isUuid(p)) throw new Error("Invalid product_id");
      out.product_id = p ?? null;
    }
  } catch (e) {
    return [{}, e instanceof Error ? e.message : "Invalid protocol"];
  }
  // NOT NULL text columns in the legacy schema.
  if (!partial) for (const k of ["dosage", "frequency", "duration", "storage"]) out[k] ??= "";
  // Switching to text clears the attachment.
  if (out.content_type === "text") {
    out.file_path = null;
    out.file_url = null;
  }
  return [out, null];
}

function validProductIds(v: unknown): v is string[] {
  return Array.isArray(v) && v.length <= 500 && v.every(isUuid);
}

async function replaceAssignments(protocolId: string, productIds: string[]): Promise<string | null> {
  const unique = [...new Set(productIds)];
  let del = admin.from("product_protocols").delete().eq("protocol_id", protocolId);
  if (unique.length) del = del.not("product_id", "in", `(${unique.join(",")})`);
  const { error: delErr } = await del;
  if (delErr) return delErr.message;
  if (unique.length) {
    const { error } = await admin
      .from("product_protocols")
      .upsert(unique.map((product_id) => ({ product_id, protocol_id: protocolId })), {
        onConflict: "product_id,protocol_id",
        ignoreDuplicates: true,
      });
    if (error) return error.message;
  }
  // Keep the legacy single-product column roughly in sync.
  await admin.from("protocols").update({ product_id: unique[0] ?? null }).eq("id", protocolId);
  return null;
}

async function withSignedUrls(rows: Row[]): Promise<Row[]> {
  const paths = rows.map((r) => r.file_path).filter((p): p is string => typeof p === "string" && !!p);
  const map = new Map<string, string>();
  if (paths.length) {
    const { data } = await admin.storage.from(BUCKET).createSignedUrls(paths, PREVIEW_URL_SECONDS);
    for (const d of data ?? []) if (d.path && d.signedUrl) map.set(d.path, d.signedUrl);
  }
  return rows.map((r) => ({
    ...r,
    signed_url: typeof r.file_path === "string" ? map.get(r.file_path) ?? null : null,
  }));
}

async function loadOne(id: string): Promise<Row | null> {
  const { data } = await admin.from("protocols").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: links } = await admin.from("product_protocols").select("product_id").eq("protocol_id", id);
  const [row] = await withSignedUrls([{ ...data, product_ids: (links ?? []).map((l) => l.product_id) }]);
  return row;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return errorJson("Method not allowed", 405);

  const session = await requireAdmin(sessionTokenFrom(req));
  if (!session) return errorJson("Admin session expired. Please log in again.", 401);
  const { data: cred } = await admin.from("admin_credentials").select("must_rotate").eq("id", true).maybeSingle();
  if (cred?.must_rotate !== false) return errorJson("Change the admin password first", 403);

  const body = await readJson<Row>(req);

  try {
    switch (body.action) {
      case "list": {
        const { data, error } = await admin
          .from("protocols")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });
        if (error) throw error;
        const { data: links, error: lErr } = await admin.from("product_protocols").select("product_id, protocol_id");
        if (lErr) throw lErr;
        const byProtocol = new Map<string, string[]>();
        for (const l of links ?? []) {
          const list = byProtocol.get(l.protocol_id) ?? [];
          list.push(l.product_id);
          byProtocol.set(l.protocol_id, list);
        }
        const rows = (data ?? []).map((p) => ({ ...p, product_ids: byProtocol.get(p.id) ?? [] }));
        return json({ protocols: await withSignedUrls(rows) });
      }

      case "create": {
        const [clean, err] = sanitizeProtocol(body.protocol, false);
        if (err) return errorJson(err);
        const productIds = body.product_ids ?? (clean.product_id ? [clean.product_id] : []);
        if (!validProductIds(productIds)) return errorJson("Invalid product_ids");
        const { data, error } = await admin.from("protocols").insert(clean).select("*").single();
        if (error) throw error;
        if (productIds.length) {
          const aErr = await replaceAssignments(data.id, productIds);
          if (aErr) throw new Error(aErr);
        }
        return json({ protocol: await loadOne(data.id) });
      }

      case "update": {
        if (!isUuid(body.id)) return errorJson("Invalid id");
        const [clean, err] = sanitizeProtocol(body.updates, true);
        if (err) return errorJson(err);
        if (!Object.keys(clean).length) return errorJson("Nothing to update");
        const { data, error } = await admin.from("protocols").update(clean).eq("id", body.id).select("id").maybeSingle();
        if (error) throw error;
        if (!data) return errorJson("Protocol not found", 404);
        return json({ protocol: await loadOne(body.id) });
      }

      case "toggle_active": {
        if (!isUuid(body.id)) return errorJson("Invalid id");
        if (typeof body.active !== "boolean") return errorJson("active must be true/false");
        const { data, error } = await admin
          .from("protocols")
          .update({ active: body.active })
          .eq("id", body.id)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) return errorJson("Protocol not found", 404);
        return json({ protocol: await loadOne(body.id) });
      }

      case "delete": {
        if (!isUuid(body.id)) return errorJson("Invalid id");
        const { data: existing } = await admin.from("protocols").select("file_path").eq("id", body.id).maybeSingle();
        const { error } = await admin.from("protocols").delete().eq("id", body.id);
        if (error) throw error;
        // Remove the private file if no other protocol uses it (best effort).
        const path = existing?.file_path;
        if (path) {
          const { count } = await admin
            .from("protocols")
            .select("id", { count: "exact", head: true })
            .eq("file_path", path);
          if (!count) await admin.storage.from(BUCKET).remove([path]);
        }
        return json({ success: true });
      }

      case "set_assignments": {
        if (!isUuid(body.protocol_id)) return errorJson("Invalid protocol_id");
        if (!validProductIds(body.product_ids)) return errorJson("Invalid product_ids");
        const { data: exists } = await admin.from("protocols").select("id").eq("id", body.protocol_id).maybeSingle();
        if (!exists) return errorJson("Protocol not found", 404);
        const aErr = await replaceAssignments(body.protocol_id, body.product_ids);
        if (aErr) throw new Error(aErr);
        return json({ product_ids: [...new Set(body.product_ids)] });
      }

      case "create_upload_url": {
        const filename = typeof body.filename === "string" ? body.filename : "";
        const ext = (filename.split(".").pop() ?? "").toLowerCase();
        if (!ext || !ALLOWED_EXTENSIONS.has(ext)) return errorJson("Unsupported file type");
        const path = `${Date.now()}-${crypto.randomUUID().slice(0, 12)}.${ext}`;
        const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
        if (error || !data) throw error ?? new Error("Could not create upload URL");
        return json({ path: data.path ?? path, token: data.token, signed_url: data.signedUrl });
      }

      case "file_url": {
        if (typeof body.path !== "string" || !PATH_RE.test(body.path)) return errorJson("Invalid path");
        const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(body.path, 600);
        if (error || !data) return errorJson("File not found", 404);
        return json({ url: data.signedUrl });
      }

      case "get_portal_settings": {
        const { data, error } = await admin
          .from("protocol_portal_settings")
          .select("password_hash, password_plain, updated_at, session_hours")
          .eq("id", true)
          .maybeSingle();
        if (error) throw error;
        return json({
          has_password: !!data?.password_hash,
          password: data?.password_plain ?? null,
          updated_at: data?.updated_at ?? null,
          session_hours: data?.session_hours ?? 720,
        });
      }

      case "set_portal_password": {
        const pw = body.password;
        if (typeof pw !== "string" || pw.length < 8) return errorJson("Password must be at least 8 characters");
        if (pw.length > 200) return errorJson("Password is too long");
        const { data, error } = await admin.rpc("protocol_set_password", { p_kind: "portal", p_password: pw });
        if (error || typeof data !== "number") {
          console.error("protocol-admin: set portal password failed:", error?.message);
          return errorJson("Could not update the portal password", 500);
        }
        return json({ password_version: data, updated_at: new Date().toISOString() });
      }

      default:
        return errorJson("Unknown action", 400);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? "unknown";
    console.error(`protocol-admin ${String(body.action)} failed:`, msg);
    return errorJson("Server error", 500);
  }
});
