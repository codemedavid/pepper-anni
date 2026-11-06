// protocol-delivery: builds the "your protocols" email for an order and hands it to PostHog.
//
// DEPLOY WITH verify_jwt = false (supabase/config.toml or `supabase functions deploy protocol-delivery
// --no-verify-jwt`). Postgres (pg_net) cannot send a Supabase JWT; this function does its own auth:
//   - Dispatch (DB trigger / sweep): header `x-dispatch-secret` == Vault `protocol_dispatch_secret`.
//       body {order_id}. Inserts the single 'auto' delivery row (partial unique index), then sends.
//       A second dispatch for the same order returns {duplicate:true} and sends nothing.
//   - Admin (dashboard): header `x-session-token` = admin token from admin-auth. Returns 403
//       "Change the admin password first" while admin_credentials.must_rotate is true.
//       {action:'list', status?, search?, order_id?, limit?, offset?}
//       {action:'resend', order_id}   -> new 'manual' row, built from the LATEST active protocols
//       {action:'preview', order_id}  -> rendered subject/html/text, nothing sent or stored
//
// "Send" = PostHog capture of `tbs_protocols_ready` (distinct_id = customer email). The PostHog Workflow
// sends the email; PostHog engagement events come back through `protocol-delivery-status`.
import { admin, errorJson, getSecret, json, preflight, readJson, safeEqual, sessionTokenFrom } from "../_shared/http.ts";
import { requireAdmin, signToken } from "../_shared/session.ts";
import {
  type AssignmentLike,
  buildSubject,
  type EmailProtocol,
  type ProtocolLike,
  renderPreviewHtml,
  renderProtocolsHtml,
  renderProtocolsText,
  resolveOrderProtocols,
  snapshotProtocols,
  toTemplateProtocols,
} from "../_shared/protocolEmail.ts";

const BUCKET = "protocol-files";
const EVENT = "tbs_protocols_ready";
const UNCONFIRMED_AFTER_MS = 30 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SENDABLE_ORDER_STATUSES = ["confirmed", "processing", "shipped", "delivered"];

interface OrderRow {
  id: string;
  order_number: string | null;
  customer_email: string | null;
  customer_name: string | null;
  order_items: unknown;
  order_status: string;
}

interface ConfigRow {
  enabled: boolean;
  posthog_project_key: string | null;
  posthog_host: string | null;
  link_ttl_days: number | null;
  site_url: string | null;
}

interface DeliveryRow {
  id: string;
  order_id: string;
  status: string;
  attempts: number;
  handed_off_at: string | null;
  created_at: string;
  [key: string]: unknown;
}

interface BuiltEmail {
  protocols: EmailProtocol[];
  subject: string;
  protocolsHtml: string;
  protocolsText: string;
  portalUrl: string;
  /** One-click link that opens the portal without the password, or null when no portal password is set. */
  portalLinkUrl: string | null;
  portalPassword: string | null;
  linkTtlDays: number;
}

const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const nowIso = () => new Date().toISOString();

async function loadConfig(): Promise<ConfigRow> {
  const { data, error } = await admin
    .from("protocol_config")
    .select("enabled, posthog_project_key, posthog_host, link_ttl_days, site_url")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`protocol_config: ${error.message}`);
  return (data as ConfigRow) ?? {
    enabled: true,
    posthog_project_key: null,
    posthog_host: null,
    link_ttl_days: 30,
    site_url: null,
  };
}

async function loadOrder(orderId: string): Promise<OrderRow | null> {
  const { data, error } = await admin
    .from("orders")
    .select("id, order_number, customer_email, customer_name, order_items, order_status")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`orders: ${error.message}`);
  return (data as OrderRow) ?? null;
}

/** Resolve the order's products to active protocols and render everything (signing file links). */
async function buildEmail(order: OrderRow, cfg: ConfigRow): Promise<BuiltEmail> {
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const productIds = [
    ...new Set(
      items.map((i: { product_id?: unknown }) => (i && typeof i === "object" ? i.product_id : null)).filter(isUuid),
    ),
  ];

  let assignments: AssignmentLike[] = [];
  let protocols: ProtocolLike[] = [];
  if (productIds.length) {
    const { data: links, error: linkErr } = await admin
      .from("product_protocols")
      .select("product_id, protocol_id, sort_order")
      .in("product_id", productIds);
    if (linkErr) throw new Error(`product_protocols: ${linkErr.message}`);
    assignments = (links ?? []) as AssignmentLike[];

    const protocolIds = [...new Set(assignments.map((a) => a.protocol_id).filter(isUuid))];
    const orFilter = [
      `product_id.in.(${productIds.join(",")})`,
      ...(protocolIds.length ? [`id.in.(${protocolIds.join(",")})`] : []),
    ].join(",");
    const { data: rows, error: pErr } = await admin
      .from("protocols")
      .select(
        "id, name, category, dosage, frequency, duration, notes, storage, sort_order, active, version, content_type, file_url, file_path, product_id",
      )
      .eq("active", true)
      .or(orFilter);
    if (pErr) throw new Error(`protocols: ${pErr.message}`);
    protocols = (rows ?? []) as ProtocolLike[];
  }

  const resolved = resolveOrderProtocols(items, assignments, protocols);
  const linkTtlDays = cfg.link_ttl_days ?? 30;

  const withLinks: EmailProtocol[] = await Promise.all(
    resolved.map(async (p) => {
      let url: string | null = null;
      if (p.file_path) {
        const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(p.file_path, linkTtlDays * 86400);
        if (error) console.error(`sign ${p.file_path} failed:`, error.message);
        url = data?.signedUrl ?? null;
      }
      return { ...p, download_url: url ?? p.file_url ?? null };
    }),
  );

  const { data: portal } = await admin
    .from("protocol_portal_settings")
    .select("password_plain, password_hash, password_version")
    .eq("id", true)
    .maybeSingle();
  const portalPassword = (portal?.password_plain as string | null) ?? null;
  const portalUrl = `${(cfg.site_url || "https://pepperanni.com").replace(/\/+$/, "")}/protocols`;
  // The token goes in the URL fragment (#), so it is never sent to the web server or written to its logs.
  // It lasts as long as the signed download links and stops working when the portal password changes.
  let portalLinkUrl: string | null = null;
  if (portal?.password_hash && typeof portal.password_version === "number") {
    const linkToken = await signToken("portal_link", portal.password_version, linkTtlDays * 24);
    portalLinkUrl = `${portalUrl}#access=${linkToken}`;
  }
  const opts = { portalUrl, portalLinkUrl, portalPassword, linkTtlDays };

  return {
    protocols: withLinks,
    subject: buildSubject(order.order_number, withLinks.length),
    protocolsHtml: renderProtocolsHtml(withLinks, opts),
    protocolsText: renderProtocolsText(withLinks, opts),
    portalUrl,
    portalLinkUrl,
    portalPassword,
    linkTtlDays,
  };
}

async function updateDelivery(id: string, patch: Record<string, unknown>) {
  const { data, error } = await admin
    .from("protocol_deliveries")
    .update({ ...patch, updated_at: nowIso() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) console.error(`update delivery ${id}:`, error.message);
  return data as DeliveryRow | null;
}

/** Build + hand off one delivery row. Always ends in handed_off / failed / skipped. */
async function deliver(delivery: DeliveryRow, order: OrderRow, cfg: ConfigRow): Promise<DeliveryRow | null> {
  const attempts = (delivery.attempts ?? 0) + 1;
  let built: BuiltEmail;
  try {
    built = await buildEmail(order, cfg);
  } catch (e) {
    return updateDelivery(delivery.id, {
      status: "failed",
      status_reason: `Could not build email: ${(e as Error).message}`.slice(0, 500),
      attempts,
      failed_at: nowIso(),
    });
  }

  const snapshot = snapshotProtocols(built.protocols);
  const email = (order.customer_email || "").trim();
  if (!email) {
    return updateDelivery(delivery.id, { status: "skipped", status_reason: "Order has no customer email", attempts, protocols: snapshot });
  }
  if (!built.protocols.length) {
    return updateDelivery(delivery.id, {
      status: "skipped",
      status_reason: "No active protocols are assigned to the ordered products",
      attempts,
      protocols: snapshot,
    });
  }
  if (!cfg.posthog_project_key) {
    return updateDelivery(delivery.id, {
      status: "failed",
      status_reason: "protocol_config.posthog_project_key is not set",
      attempts,
      protocols: snapshot,
      failed_at: nowIso(),
    });
  }

  const properties = {
    delivery_id: delivery.id,
    order_id: order.id,
    order_number: order.order_number,
    customer_name: order.customer_name,
    email,
    subject: built.subject,
    protocol_count: built.protocols.length,
    protocol_names: built.protocols.map((p) => p.name).join(", "),
    protocols_html: built.protocolsHtml,
    protocols_text: built.protocolsText,
    // Structured copy for the Liquid {% for %} fallback template (see POSTHOG_SETUP.md).
    protocols: toTemplateProtocols(built.protocols),
    // The email button uses portal_url, so it is the one-click link whenever one could be made.
    portal_url: built.portalLinkUrl ?? built.portalUrl,
    portal_base_url: built.portalUrl,
    portal_password: built.portalPassword,
    link_ttl_days: built.linkTtlDays,
    trigger_source: delivery.trigger_source,
    $set: { email, name: order.customer_name },
  };

  const host = (cfg.posthog_host || "https://us.i.posthog.com").replace(/\/+$/, "");
  try {
    const res = await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: cfg.posthog_project_key,
        event: EVENT,
        distinct_id: email,
        properties,
        timestamp: nowIso(),
      }),
    });
    if (res.ok) {
      return updateDelivery(delivery.id, {
        status: "handed_off",
        status_reason: null,
        attempts,
        protocols: snapshot,
        handed_off_at: nowIso(),
        customer_email: email,
      });
    }
    const text = (await res.text().catch(() => "")).slice(0, 300);
    return updateDelivery(delivery.id, {
      status: "failed",
      status_reason: `PostHog capture HTTP ${res.status}${text ? `: ${text}` : ""}`,
      attempts,
      protocols: snapshot,
      failed_at: nowIso(),
    });
  } catch (e) {
    return updateDelivery(delivery.id, {
      status: "failed",
      status_reason: `PostHog capture error: ${(e as Error).message}`.slice(0, 500),
      attempts,
      protocols: snapshot,
      failed_at: nowIso(),
    });
  }
}

function baseRow(order: OrderRow, source: "auto" | "manual") {
  return {
    order_id: order.id,
    order_number: order.order_number,
    customer_email: order.customer_email,
    customer_name: order.customer_name,
    trigger_source: source,
    status: "pending",
    requested_by: source === "auto" ? "system" : "admin",
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleDispatch(orderId: unknown): Promise<Response> {
  if (!isUuid(orderId)) return errorJson("order_id must be a uuid");
  const cfg = await loadConfig();
  if (!cfg.enabled) return json({ ok: true, disabled: true });
  const order = await loadOrder(orderId);
  if (!order) return errorJson("order not found", 404);
  if (!SENDABLE_ORDER_STATUSES.includes(order.order_status)) {
    return json({ ok: true, ignored: true, reason: `order status is ${order.order_status}` });
  }

  // Duplicate guard: uq_protocol_deliveries_auto_per_order is a PARTIAL unique index, which PostgREST
  // upsert cannot target, so a plain INSERT is used and a unique violation (23505) means "already done".
  const { data: inserted, error } = await admin
    .from("protocol_deliveries")
    .insert(baseRow(order, "auto"))
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return json({ ok: true, duplicate: true });
    console.error("insert auto delivery:", error.message);
    return errorJson("could not record delivery", 500);
  }
  if (!inserted) return json({ ok: true, duplicate: true });

  const result = await deliver(inserted as DeliveryRow, order, cfg);
  return json({ ok: true, delivery: result });
}

async function handleResend(orderId: unknown): Promise<Response> {
  if (!isUuid(orderId)) return errorJson("order_id must be a uuid");
  const order = await loadOrder(orderId);
  if (!order) return errorJson("order not found", 404);
  const cfg = await loadConfig();
  const { data: inserted, error } = await admin
    .from("protocol_deliveries")
    .insert(baseRow(order, "manual"))
    .select("*")
    .single();
  if (error || !inserted) return errorJson(`could not record delivery: ${error?.message ?? "unknown"}`, 500);
  const result = await deliver(inserted as DeliveryRow, order, cfg);
  return json({ ok: true, delivery: result ? withFlags(result) : null });
}

async function handlePreview(orderId: unknown): Promise<Response> {
  if (!isUuid(orderId)) return errorJson("order_id must be a uuid");
  const order = await loadOrder(orderId);
  if (!order) return errorJson("order not found", 404);
  const cfg = await loadConfig();
  const built = await buildEmail(order, cfg);
  const opts = {
    portalUrl: built.portalUrl,
    portalLinkUrl: built.portalLinkUrl,
    portalPassword: built.portalPassword,
    linkTtlDays: built.linkTtlDays,
  };
  const email = (order.customer_email || "").trim();
  return json({
    ok: true,
    to: email || null,
    subject: built.subject,
    html: renderPreviewHtml(built.protocols, { ...opts, customerName: order.customer_name, orderNumber: order.order_number }),
    protocols_html: built.protocolsHtml,
    text: built.protocolsText,
    protocols: snapshotProtocols(built.protocols),
    would_skip: !email
      ? "Order has no customer email"
      : !built.protocols.length
      ? "No active protocols are assigned to the ordered products"
      : null,
    auto_enabled: cfg.enabled,
  });
}

function withFlags(row: DeliveryRow) {
  const cutoff = Date.now() - UNCONFIRMED_AFTER_MS;
  const unconfirmed = (row.status === "handed_off" && !!row.handed_off_at && Date.parse(row.handed_off_at) < cutoff) ||
    (row.status === "pending" && Date.parse(row.created_at) < cutoff);
  return { ...row, unconfirmed };
}

const sanitizeSearch = (s: string) => s.replace(/[,()*%\\"':]/g, " ").trim().slice(0, 100);

async function handleList(body: Record<string, unknown>): Promise<Response> {
  const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);
  const offset = Math.max(Number(body.offset) || 0, 0);
  const status = typeof body.status === "string" ? body.status : "all";
  const search = typeof body.search === "string" ? sanitizeSearch(body.search) : "";

  let q = admin
    .from("protocol_deliveries")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (isUuid(body.order_id)) q = q.eq("order_id", body.order_id);

  const cutoff = new Date(Date.now() - UNCONFIRMED_AFTER_MS).toISOString();
  switch (status) {
    case "all":
      break;
    case "failed":
      q = q.in("status", ["failed", "bounced"]);
      break;
    case "unconfirmed":
      q = q.or(`and(status.eq.handed_off,handed_off_at.lt.${cutoff}),and(status.eq.pending,created_at.lt.${cutoff})`);
      break;
    case "sent":
    case "delivered":
    case "skipped":
    case "pending":
    case "handed_off":
    case "bounced":
      q = q.eq("status", status);
      break;
    default:
      return errorJson("unknown status filter");
  }
  if (search) q = q.or(`order_number.ilike.*${search}*,customer_email.ilike.*${search}*,customer_name.ilike.*${search}*`);

  const { data, error, count } = await q;
  if (error) return errorJson(`list failed: ${error.message}`, 500);
  return json({ ok: true, deliveries: ((data ?? []) as DeliveryRow[]).map(withFlags), total: count ?? 0 });
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return errorJson("method not allowed", 405);

  try {
    const body = await readJson<Record<string, unknown>>(req);

    const dispatchHeader = req.headers.get("x-dispatch-secret");
    if (dispatchHeader !== null) {
      const secret = await getSecret("protocol_dispatch_secret");
      if (!secret || !safeEqual(dispatchHeader, secret)) return errorJson("unauthorized", 401);
      return await handleDispatch(body.order_id);
    }

    const session = await requireAdmin(sessionTokenFrom(req));
    if (!session) return errorJson("Admin session expired. Please log in again.", 401);
    // While the seeded (publicly known) admin password is still in use, admin actions stay locked.
    // Same gate as protocol-admin. The dispatch path above is unaffected.
    const { data: cred } = await admin.from("admin_credentials").select("must_rotate").eq("id", true).maybeSingle();
    if (cred?.must_rotate !== false) return errorJson("Change the admin password first", 403);

    switch (body.action) {
      case "list":
        return await handleList(body);
      case "resend":
        return await handleResend(body.order_id);
      case "preview":
        return await handlePreview(body.order_id);
      default:
        return errorJson("unknown action");
    }
  } catch (e) {
    console.error("protocol-delivery error:", e);
    return errorJson("internal error", 500);
  }
});
