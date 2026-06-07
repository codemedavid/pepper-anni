// supabase/functions/telegram-order-sync
//
// Internal edge function invoked by the `notify_telegram_order` trigger (and the
// reconcile cron) via pg_net whenever an order is created or its status changes —
// from the admin dashboard OR a Telegram button. It is the single place that keeps
// the Telegram forum in sync with the `orders` table:
//
//   • INSERT          -> post the order card (+ payment proof) into "New Orders"
//   • status changed  -> move the card to the topic for the new status
//                        (Telegram can't move messages, so delete + repost)
//
// It NEVER changes orders.order_status, so it can't loop with the trigger.
// Auth: shared secret header `x-sync-secret` == Vault `telegram_sync_secret`
//       (constant-time comparison). Deploy with verify_jwt = false.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const STATUS_TOPIC: Record<string, string> = {
  new: "new_orders",
  confirmed: "to_prepare",
  processing: "to_prepare",
  shipped: "to_ship",
  delivered: "completed",
  cancelled: "cancelled",
};

const TITLE: Record<string, string> = {
  new: "🛒 New Order",
  confirmed: "📦 Order",
  processing: "📦 Order",
  shipped: "🚚 Order",
  delivered: "✅ Order",
  cancelled: "❌ Order",
};

const CONTACT_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  viber: "Viber",
  telegram: "Telegram",
};

const TG_TEXT_LIMIT = 4096;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function safeEqual(a: string | null, b: string | null): boolean {
  const ea = new TextEncoder().encode(a ?? "");
  const eb = new TextEncoder().encode(b ?? "");
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

async function getSecret(name: string): Promise<string | null> {
  const { data, error } = await admin.rpc("telegram_get_secret", { p_name: name });
  if (error) {
    console.error(`getSecret(${name}) failed:`, error.message);
    return null;
  }
  return (data as string) ?? null;
}

async function loadConfig() {
  const { data } = await admin.from("telegram_config").select("*").eq("id", true).maybeSingle();
  return data;
}

async function threadFor(topicKey: string): Promise<number | null> {
  const { data } = await admin
    .from("telegram_topic_map").select("message_thread_id").eq("topic_key", topicKey).maybeSingle();
  return data?.message_thread_id ?? null;
}

// ---- Telegram Bot API --------------------------------------------------------
async function tg(token: string, method: string, payload: Record<string, unknown>) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) {
      const desc = String(data.description || "").toLowerCase();
      // benign: editing a card to an identical state
      if (!desc.includes("message is not modified")) {
        console.error(`Telegram ${method} not ok:`, JSON.stringify(data));
      }
    }
    return data;
  } catch (e) {
    console.error(`Telegram ${method} threw:`, (e as Error).message);
    return { ok: false };
  }
}

async function sendCard(token: string, chatId: number, threadId: number | null, text: string, keyboard: unknown): Promise<number | null> {
  const payload: Record<string, unknown> = { chat_id: chatId, text, disable_web_page_preview: true };
  if (threadId != null) payload.message_thread_id = threadId;
  if (keyboard) payload.reply_markup = { inline_keyboard: keyboard };
  const r = await tg(token, "sendMessage", payload);
  return r.ok ? r.result.message_id : null;
}

async function editCard(token: string, chatId: number, messageId: number, text: string, keyboard: unknown[] | null) {
  await tg(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard ?? [] },
  });
}

async function sendProof(token: string, chatId: number, threadId: number | null, url: string, caption: string): Promise<number | null> {
  const base: Record<string, unknown> = { chat_id: chatId, caption: caption.slice(0, 1024) };
  if (threadId != null) base.message_thread_id = threadId;
  let r = await tg(token, "sendPhoto", { ...base, photo: url });
  if (!r.ok) r = await tg(token, "sendDocument", { ...base, document: url });
  if (r.ok) return r.result.message_id;
  return await sendCard(token, chatId, threadId, `${caption}\n${url}`, null);
}

// delete a message; returns true if Telegram accepted (false e.g. >48h old)
async function del(token: string, chatId: number, messageId: number | null): Promise<boolean> {
  if (messageId == null) return true;
  const r = await tg(token, "deleteMessage", { chat_id: chatId, message_id: messageId });
  return !!r.ok;
}

async function stripButtons(token: string, chatId: number, messageId: number) {
  await tg(token, "editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
}

// ---- formatting --------------------------------------------------------------
const peso = (n: number) =>
  "₱" + new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

function fmtUTC(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

const orderRef = (o: any) => o.order_number || String(o.id).slice(0, 8);
const who = (actor: string | null | undefined) => (actor ? actor : "the dashboard");

function keyboardFor(status: string): unknown[] | null {
  switch (status) {
    case "new":
      return [[{ text: "✅ Confirm Order", callback_data: "a|confirm" }], [{ text: "❌ Cancel", callback_data: "a|cancel" }]];
    case "confirmed":
    case "processing":
      return [[{ text: "🚚 Ship", callback_data: "a|ship" }], [{ text: "❌ Cancel", callback_data: "a|cancel" }]];
    case "shipped":
      return [[{ text: "✅ Complete", callback_data: "a|complete" }]];
    default:
      return null; // delivered / cancelled => terminal
  }
}

function buildCardText(o: any, status: string, courierName: string | null, locationName: string, meta: any): string {
  const lines: string[] = [];
  lines.push(`${TITLE[status] || "🛒 Order"} #${orderRef(o)}`);
  lines.push(`Customer: ${o.customer_name ?? ""}`);
  lines.push(`Email: ${o.customer_email ?? ""}`);
  lines.push(`Phone: ${o.customer_phone ?? ""}`);
  const contact = o.contact_method ? (CONTACT_LABEL[String(o.contact_method).toLowerCase()] || o.contact_method) : "—";
  lines.push(`Contact via: ${contact}`);

  lines.push("Items:");
  const items = Array.isArray(o.order_items) ? o.order_items : [];
  const MAX_ITEM_LINES = 40;
  const shown = items.slice(0, MAX_ITEM_LINES);
  for (const it of shown) {
    const variation = it.variation_name ? ` - ${it.variation_name}` : "";
    lines.push(`• ${it.product_name}${variation} × ${it.quantity} — ${peso(it.price)}`);
  }
  if (items.length > MAX_ITEM_LINES) lines.push(`…and ${items.length - MAX_ITEM_LINES} more item(s)`);

  const discount = Number(o.discount_applied) || 0;
  const subtotal = (Number(o.total_price) || 0) + discount;
  lines.push(`Subtotal: ${peso(subtotal)}`);
  if (discount > 0) lines.push(`Discount (${o.promo_code || "PROMO"}): -${peso(discount)}`);

  const fee = Number(o.shipping_fee) || 0;
  const courierSuffix = courierName ? ` (${courierName})` : "";
  const shipWhere = locationName ? ` (${locationName}${courierSuffix})` : courierName ? ` (${courierName})` : "";
  lines.push(`Shipping: ${peso(fee)}${shipWhere}`);
  lines.push(`Total: ${peso((Number(o.total_price) || 0) + fee)}`);
  lines.push(`Payment: ${o.payment_method_name || "—"}`);

  const addr = [o.shipping_address, o.shipping_barangay, o.shipping_city, o.shipping_state, o.shipping_zip_code]
    .filter((x) => x && String(x).trim().length > 0).join(", ");
  lines.push(`Address: ${addr}`);
  lines.push(`Status: ${status}`);

  const footer: string[] = [];
  if (meta?.confirmed_at) footer.push(`✅ Confirmed by ${who(meta.confirmed_by)} at ${fmtUTC(meta.confirmed_at)}`);
  if (status === "shipped" && meta?.actionAt) footer.push(`🚚 Shipped by ${who(meta.actionActor)} at ${fmtUTC(meta.actionAt)}`);
  else if (status === "delivered" && meta?.actionAt) footer.push(`📦 Completed by ${who(meta.actionActor)} at ${fmtUTC(meta.actionAt)}`);
  else if (status === "cancelled" && meta?.actionAt) footer.push(`❌ Cancelled by ${who(meta.actionActor)} at ${fmtUTC(meta.actionAt)}`);
  if (footer.length) lines.push("", ...footer);

  let text = lines.join("\n");
  if (text.length > TG_TEXT_LIMIT) text = text.slice(0, TG_TEXT_LIMIT - 2) + "\n…";
  return text;
}

async function resolveCourier(o: any): Promise<string | null> {
  try {
    if (o.courier_id) {
      const { data } = await admin.from("couriers").select("name").eq("id", o.courier_id).maybeSingle();
      if (data?.name) return data.name;
    }
    if (o.shipping_provider) {
      const { data } = await admin.from("couriers").select("name").eq("code", o.shipping_provider).maybeSingle();
      if (data?.name) return data.name;
    }
  } catch (_) { /* best effort */ }
  return null;
}

async function resolveLocation(o: any): Promise<string> {
  const raw = o.shipping_location;
  if (!raw) return "";
  try {
    const { data } = await admin.from("shipping_locations").select("name").eq("id", raw).maybeSingle();
    if (data?.name) return data.name;
  } catch (_) { /* best effort */ }
  return String(raw).replace(/_/g, " ");
}

// ---- main --------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const expected = await getSecret("telegram_sync_secret");
  if (!expected || !safeEqual(req.headers.get("x-sync-secret"), expected)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
  const orderId = body?.order_id;
  if (!orderId) return json({ ok: false, error: "no order_id" }, 400);

  const cfg = await loadConfig();
  if (!cfg || cfg.enabled !== true || !cfg.chat_id) return json({ ok: true, skipped: "not configured" });
  const token = await getSecret("telegram_bot_token");
  if (!token) return json({ ok: true, skipped: "no token" });

  const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return json({ ok: true, skipped: "order gone" });

  const chatId = Number(cfg.chat_id);
  const status = order.order_status as string;
  const targetThread = await threadFor(STATUS_TOPIC[status] ?? "new_orders");
  const courierName = await resolveCourier(order);
  const locationName = await resolveLocation(order);

  // load (or claim) the per-order bookkeeping row
  let { data: existing } = await admin.from("order_telegram_messages").select("*").eq("order_id", orderId).maybeSingle();
  let iOwnSend = false;
  if (!existing) {
    const { error } = await admin
      .from("order_telegram_messages")
      .insert({ order_id: orderId, chat_id: chatId, current_status: "__sending__" });
    if (!error) {
      iOwnSend = true;
    } else {
      const r = await admin.from("order_telegram_messages").select("*").eq("order_id", orderId).maybeSingle();
      existing = r.data;
    }
  }
  const firstPost = !existing || !existing.main_message_id;
  // Another invocation is mid-send -> don't post a duplicate. But only honour a
  // FRESH claim: a "__sending__" row older than 60s is an abandoned/crashed send
  // (or a failed first post), so we take it over and repost — otherwise the order
  // could be stuck invisible forever.
  if (firstPost && !iOwnSend && existing && existing.current_status === "__sending__" && existing.main_message_id == null) {
    const age = Date.now() - new Date(existing.updated_at ?? 0).getTime();
    if (age < 60000) return json({ ok: true, skipped: "sending elsewhere" });
    // stale claim -> fall through and (re)post as the owner
  }

  const nowIso = new Date().toISOString();
  const audit: any[] = Array.isArray(existing?.audit) ? existing!.audit : [];
  const last = audit[audit.length - 1];
  const isNewTransition = !last || last.status !== status;
  const actor = existing?.pending_actor_status === status ? (existing?.pending_actor ?? null) : null;

  let confirmedBy: string | null | undefined = existing?.confirmed_at ? (existing?.confirmed_by ?? null) : undefined;
  let confirmedAt: string | null = existing?.confirmed_at ?? null;
  // Telegram confirms set confirmed_by/at durably in tg_confirm_order; only fill them
  // here for dashboard-initiated confirms (where no RPC recorded them).
  if (status === "confirmed" && isNewTransition && !confirmedAt) { confirmedBy = actor; confirmedAt = nowIso; }

  const actionAt = isNewTransition ? nowIso : last?.at ?? nowIso;
  const meta = { confirmed_by: confirmedBy, confirmed_at: confirmedAt, actionActor: actor, actionAt };

  const text = buildCardText(order, status, courierName, locationName, meta);
  const keyboard = keyboardFor(status);
  const proofCaption = `Payment proof for order #${orderRef(order)}`;

  let mainId = existing?.main_message_id ?? null;
  let proofId = existing?.proof_message_id ?? null;
  let threadNow = existing?.message_thread_id ?? null;

  if (firstPost) {
    const newMain = await sendCard(token, chatId, targetThread, text, keyboard);
    if (newMain == null) {
      // Release the "__sending__" claim so a later reconcile re-fire can repost cleanly.
      await admin.from("order_telegram_messages")
        .update({ current_status: null, updated_at: new Date().toISOString() })
        .eq("order_id", orderId);
      return json({ ok: false, error: "card send failed" }, 502);
    }
    mainId = newMain;
    proofId = order.payment_proof_url ? await sendProof(token, chatId, targetThread, order.payment_proof_url, proofCaption) : null;
    threadNow = targetThread;
  } else if (threadNow === targetThread) {
    // same topic (idempotent re-delivery, or confirmed->processing) -> edit in place
    await editCard(token, chatId, mainId as number, text, keyboard);
  } else {
    // topic move: remove the old card, repost in the new topic
    const deleted = await del(token, chatId, mainId);
    if (!deleted && mainId != null) await stripButtons(token, chatId, mainId); // >48h: at least kill stale buttons
    await del(token, chatId, proofId);
    const newMain = await sendCard(token, chatId, targetThread, text, keyboard);
    if (newMain == null) return json({ ok: false, error: "card send failed" }, 502); // leave bookkeeping; reconcile retries
    mainId = newMain;
    proofId = order.payment_proof_url ? await sendProof(token, chatId, targetThread, order.payment_proof_url, proofCaption) : null;
    threadNow = targetThread;
  }

  if (isNewTransition) audit.push({ status, actor, at: nowIso });

  // targeted bookkeeping write (never clobbers a newer pending_actor handshake)
  await admin.from("order_telegram_messages").update({
    chat_id: chatId,
    message_thread_id: threadNow,
    main_message_id: mainId,
    proof_message_id: proofId,
    current_status: status,
    confirmed_by: confirmedBy ?? null,
    confirmed_at: confirmedAt,
    audit,
    updated_at: nowIso,
  }).eq("order_id", orderId);

  // clear ONLY the handshake we actually consumed for this status
  await admin.from("order_telegram_messages")
    .update({ pending_actor: null, pending_actor_status: null })
    .eq("order_id", orderId).eq("pending_actor_status", status);

  return json({ ok: true, order: orderRef(order), status, thread: threadNow });
});
