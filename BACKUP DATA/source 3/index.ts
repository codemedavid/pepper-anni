// supabase/functions/telegram-webhook
//
// Receives Telegram updates (set via setWebhook) and handles:
//   • order action buttons  (Confirm / Ship / Complete / Cancel)  — admins only
//   • the /bind setup flow   (map each forum topic to a status queue)
//
// All order mutations go through atomic SECURITY DEFINER RPCs:
//   - tg_confirm_order : lock + verify + deduct stock, set paid + confirmed, record actor (one txn)
//   - tg_advance_order : conditional claim (ship/complete/cancel) + record actor (one txn)
// The RPC's status change triggers `notify_telegram_order` -> telegram-order-sync, which moves the
// card. The webhook never moves cards itself, so dashboard- and Telegram-initiated changes share one
// sync path. Each transition also fires the matching PostHog event keyed to the customer's email so
// their lifecycle emails still send.
//
// Auth: Telegram secret-token header == Vault `telegram_tg_secret` (constant-time).
// Deploy with verify_jwt = false (Telegram can't send a Supabase JWT).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ok = () => new Response("ok", { status: 200 });

const TOPIC_LABELS: Record<string, string> = {
  new_orders: "New Orders",
  to_prepare: "To Prepare",
  to_ship: "To Ship",
  completed: "Completed",
  cancelled: "Cancelled",
};

const ACTIONS: Record<string, { target: string; from: string[]; event: string }> = {
  confirm: { target: "confirmed", from: ["new"], event: "tbs_order_confirmed" },
  ship: { target: "shipped", from: ["confirmed", "processing"], event: "tbs_order_shipped" },
  complete: { target: "delivered", from: ["shipped"], event: "tbs_order_delivered" },
  cancel: { target: "cancelled", from: ["new", "confirmed", "processing"], event: "tbs_order_cancelled" },
};

const peso = (n: number) =>
  "₱" + new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

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
  if (error) { console.error(`getSecret(${name}) failed:`, error.message); return null; }
  return (data as string) ?? null;
}

async function loadConfig() {
  const { data } = await admin.from("telegram_config").select("*").eq("id", true).maybeSingle();
  return data;
}

// ---- Telegram helpers --------------------------------------------------------
async function tg(token: string, method: string, payload: Record<string, unknown>) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) console.error(`Telegram ${method} not ok:`, JSON.stringify(data));
    return data;
  } catch (e) {
    console.error(`Telegram ${method} threw:`, (e as Error).message);
    return { ok: false };
  }
}

// answerCallbackQuery text is capped at 200 chars by the Bot API
const answer = (token: string, id: string, text = "", alert = false) =>
  tg(token, "answerCallbackQuery", { callback_query_id: id, text: String(text).slice(0, 200), show_alert: alert });

// Remove the inline buttons from a message so a stale/orphaned card can't be tapped again.
async function stripButtons(token: string, chatId: number, messageId: number) {
  await tg(token, "editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
}

async function isAdmin(token: string, chatId: number, userId: number): Promise<boolean> {
  const r = await tg(token, "getChatMember", { chat_id: chatId, user_id: userId });
  return r.ok && ["creator", "administrator"].includes(r.result?.status);
}

function actorOf(from: any): string {
  if (from?.username) return `@${from.username}`;
  return [from?.first_name, from?.last_name].filter(Boolean).join(" ") || "staff";
}

const ref = (o: any) => o.order_number || String(o.id).slice(0, 8);

// ---- PostHog server-side capture (mirrors the dashboard events) ---------------
async function capturePostHog(cfg: any, event: string, order: any, previousStatus: string | null) {
  try {
    if (!cfg?.posthog_project_key) return;
    if (!order.customer_email) {
      console.error("PostHog capture skipped: order", order.id, "has no customer_email");
      return;
    }
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    const withPrice = items
      .map((it: any) => `${it.quantity}x ${it.product_name}${it.variation_name ? ` - ${it.variation_name}` : ""} (${peso(it.price)})`).join("\n");
    const noPrice = items
      .map((it: any) => `${it.quantity}x ${it.product_name}${it.variation_name ? ` - ${it.variation_name}` : ""}`).join("\n");

    const common = {
      order_id: order.id,
      order_number: order.order_number,
      customer_name: order.customer_name,
      email: order.customer_email,
      customer_phone: order.customer_phone,
      total_price: order.total_price,
      shipping_fee: order.shipping_fee,
      item_count: items.length,
      promo_code: order.promo_code,
      discount_applied: order.discount_applied,
      $set: { email: order.customer_email, name: order.customer_name },
    };
    const properties = event === "tbs_order_confirmed"
      ? { ...common, items_description: withPrice, payment_method: order.payment_method_name }
      : { ...common, items_description: noPrice, tracking_number: order.tracking_number, shipping_provider: order.shipping_provider, previous_status: previousStatus };

    const host = (cfg.posthog_host || "https://us.i.posthog.com").replace(/\/$/, "");
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: cfg.posthog_project_key,
        event,
        distinct_id: order.customer_email,
        properties,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error("PostHog capture failed:", (e as Error).message);
  }
}

// ---- order action buttons ----------------------------------------------------
async function handleAction(token: string, cfg: any, cb: any, action: string) {
  const spec = ACTIONS[action];
  if (!spec) return answer(token, cb.id, "Unknown action");

  const chatId = cb.message?.chat?.id;
  if (Number(chatId) !== Number(cfg.chat_id)) return answer(token, cb.id, "Not authorized for this chat", true);
  if (!(await isAdmin(token, Number(chatId), Number(cb.from?.id)))) {
    return answer(token, cb.id, "Staff/admins only", true);
  }

  const { data: link, error: linkErr } = await admin
    .from("order_telegram_messages").select("order_id")
    .eq("chat_id", chatId).eq("main_message_id", cb.message.message_id).maybeSingle();
  if (linkErr) {
    // Transient DB error — don't touch the card (it may be perfectly valid); ask to retry.
    console.error("order lookup failed:", linkErr.message);
    return answer(token, cb.id, "Couldn't reach the database — try again", true);
  }
  if (!link) {
    // The query definitively found no row for this card: it's a stale/orphaned duplicate
    // (e.g. left behind when a topic move failed mid-flight and the card was re-posted).
    // Acting on it is impossible, and leaving the buttons live makes every tap dead-end.
    // Strip its buttons so it goes inert, and point staff at the current card.
    await stripButtons(token, Number(chatId), cb.message.message_id);
    return answer(token, cb.id, "This card is out of date — use the latest card for this order.", true);
  }

  const { data: order } = await admin.from("orders").select("*").eq("id", link.order_id).maybeSingle();
  if (!order) return answer(token, cb.id, "Order no longer exists", true);

  const current = order.order_status as string;
  const actor = actorOf(cb.from);

  if (action === "confirm") {
    const { data: res, error } = await admin.rpc("tg_confirm_order", { p_order_id: order.id, p_actor: actor });
    if (error) { console.error("tg_confirm_order:", error.message); return answer(token, cb.id, "Confirm failed — try again", true); }
    if (res?.status === "ok") {
      await capturePostHog(cfg, "tbs_order_confirmed", order, current);
      return answer(token, cb.id, "✅ Confirmed — stock deducted");
    }
    if (res?.status === "insufficient_stock") return answer(token, cb.id, `Insufficient stock: ${res.item} (have ${res.have}, need ${res.need})`, true);
    if (res?.status === "already") return answer(token, cb.id, `Already ${res.current}`, true);
    return answer(token, cb.id, "Order not found", true);
  }

  if (!spec.from.includes(current)) return answer(token, cb.id, `Can't ${action} from "${current}"`, true);

  // SHIP: don't ship yet — ask for a tracking number via force_reply. The reply
  // (handled in handleShipReply) saves the tracking and marks the order shipped.
  if (action === "ship") {
    const prompt = await tg(token, "sendMessage", {
      chat_id: chatId,
      message_thread_id: cb.message?.message_thread_id,
      text: `📦 Reply to THIS message with the tracking number for order #${ref(order)} — or reply \"-\" to ship without one.`,
      reply_markup: { force_reply: true },
    });
    if (prompt.ok) {
      await admin.from("order_telegram_messages")
        .update({ ship_prompt_message_id: prompt.result.message_id })
        .eq("order_id", order.id);
    }
    return answer(token, cb.id, "✍️ Reply with the tracking number");
  }

  // CANCEL: atomic cancel + restock (only if it was confirmed/processing).
  if (action === "cancel") {
    const { data: res, error } = await admin.rpc("tg_cancel_order", { p_order_id: order.id, p_actor: actor });
    if (error) { console.error("tg_cancel_order:", error.message); return answer(token, cb.id, "Cancel failed — try again", true); }
    if (res?.status !== "ok") return answer(token, cb.id, "Order was already updated", true);
    await capturePostHog(cfg, "tbs_order_cancelled", order, current);
    return answer(token, cb.id, res.restocked ? "❌ Cancelled — stock restored" : "❌ Order cancelled");
  }

  // COMPLETE: conditional claim shipped -> delivered.
  const { data: res, error } = await admin.rpc("tg_advance_order", {
    p_order_id: order.id, p_from: spec.from, p_to: spec.target, p_actor: actor,
  });
  if (error) { console.error("tg_advance_order:", error.message); return answer(token, cb.id, "Update failed — try again", true); }
  if (res?.status !== "ok") return answer(token, cb.id, "Order was already updated", true);
  await capturePostHog(cfg, spec.event, order, current);
  return answer(token, cb.id, "📦 Marked completed");
}

// ---- ship tracking reply -----------------------------------------------------
// Returns true if this message was a reply to a "send tracking #" prompt (handled).
async function handleShipReply(token: string, cfg: any, msg: any): Promise<boolean> {
  const replyTo = msg.reply_to_message?.message_id;
  if (replyTo == null) return false;
  const chatId = msg.chat.id;

  const { data: link } = await admin
    .from("order_telegram_messages").select("order_id")
    .eq("chat_id", chatId).eq("ship_prompt_message_id", replyTo).maybeSingle();
  if (!link) return false; // not a ship-tracking prompt reply

  if (!(await isAdmin(token, chatId, msg.from.id))) {
    await tg(token, "sendMessage", { chat_id: chatId, message_thread_id: msg.message_thread_id, text: "Staff/admins only." });
    return true;
  }

  const { data: order } = await admin.from("orders").select("*").eq("id", link.order_id).maybeSingle();
  if (!order) return true;

  const raw = (msg.text || "").trim();
  const skip = ["-", "skip", "none", "n/a", ""].includes(raw.toLowerCase());
  const tracking = skip ? null : raw;
  const actor = actorOf(msg.from);
  const prev = order.order_status as string;

  const { data: res, error } = await admin.rpc("tg_ship_order", { p_order_id: order.id, p_actor: actor, p_tracking: tracking });
  if (error) {
    console.error("tg_ship_order:", error.message);
    await tg(token, "sendMessage", { chat_id: chatId, message_thread_id: msg.message_thread_id, text: "Ship failed — try again." });
    return true;
  }
  if (res?.status !== "ok") {
    await tg(token, "sendMessage", { chat_id: chatId, message_thread_id: msg.message_thread_id, text: "Order was already updated." });
    return true;
  }

  const { data: fresh } = await admin.from("orders").select("*").eq("id", order.id).maybeSingle();
  await capturePostHog(cfg, "tbs_order_shipped", fresh || order, prev);
  await tg(token, "sendMessage", {
    chat_id: chatId, message_thread_id: msg.message_thread_id,
    text: skip ? `🚚 Order #${ref(order)} shipped (no tracking).` : `🚚 Order #${ref(order)} shipped — tracking: ${tracking}`,
  });
  return true;
}

// ---- /bind flow --------------------------------------------------------------
async function handleBindCommand(token: string, msg: any) {
  const chatId = msg.chat.id;
  const thread = msg.message_thread_id;
  if (!(await isAdmin(token, chatId, msg.from.id))) {
    return tg(token, "sendMessage", { chat_id: chatId, message_thread_id: thread, text: "Only group admins can bind topics." });
  }
  if (thread == null) {
    return tg(token, "sendMessage", { chat_id: chatId, text: "Run /bind inside the topic you want to bind (not General)." });
  }
  const buttons = Object.entries(TOPIC_LABELS).map(([key, label]) => [{ text: label, callback_data: `b|${key}` }]);
  return tg(token, "sendMessage", {
    chat_id: chatId, message_thread_id: thread,
    text: "Which order queue is THIS topic? Tap one to bind it.",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function handleBindCallback(token: string, cfg: any, cb: any, topicKey: string) {
  const chatId = cb.message?.chat?.id;
  const thread = cb.message?.message_thread_id;
  if (!(await isAdmin(token, chatId, cb.from.id))) return answer(token, cb.id, "Admins only", true);
  if (thread == null) return answer(token, cb.id, "Run /bind inside a topic, not General", true);
  if (!TOPIC_LABELS[topicKey]) return answer(token, cb.id, "Unknown queue", true);

  // always (re)capture the real chat id of the group from the bind action
  await admin.from("telegram_config").upsert({ id: true, chat_id: chatId }, { onConflict: "id" });
  await admin.from("telegram_topic_map")
    .update({ message_thread_id: thread, updated_at: new Date().toISOString() })
    .eq("topic_key", topicKey);

  await tg(token, "editMessageText", {
    chat_id: chatId, message_id: cb.message.message_id,
    text: `✅ This topic is now bound to \"${TOPIC_LABELS[topicKey]}\".`,
  });
  return answer(token, cb.id, `Bound to ${TOPIC_LABELS[topicKey]}`);
}

// ---- main --------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method !== "POST") return ok();

  const tgSecret = await getSecret("telegram_tg_secret");
  if (!tgSecret || !safeEqual(req.headers.get("x-telegram-bot-api-secret-token"), tgSecret)) {
    return new Response("unauthorized", { status: 401 });
  }

  let update: any;
  try { update = await req.json(); } catch { return ok(); }

  const cfg = await loadConfig();
  const token = await getSecret("telegram_bot_token");
  if (!token || !cfg) return ok();

  try {
    if (update.callback_query) {
      const cb = update.callback_query;
      const data: string = cb.data || "";
      if (data.startsWith("a|")) await handleAction(token, cfg, cb, data.slice(2));
      else if (data.startsWith("b|")) await handleBindCallback(token, cfg, cb, data.slice(2));
      else await answer(token, cb.id, "");
      return ok();
    }

    if (update.message) {
      const msg = update.message;
      // a reply to a "send tracking #" prompt ships the order
      if (msg.reply_to_message && (await handleShipReply(token, cfg, msg))) return ok();

      const text: string = (msg.text || "").trim();
      const cmd = text.split(/\s|@/)[0].toLowerCase();

      if (cmd === "/bind") {
        await handleBindCommand(token, msg);
      } else if (cmd === "/id") {
        await tg(token, "sendMessage", {
          chat_id: msg.chat.id, message_thread_id: msg.message_thread_id,
          text: `chat_id: ${msg.chat.id}\nmessage_thread_id: ${msg.message_thread_id ?? "(General)"}`,
        });
      } else if (cmd === "/start" || cmd === "/help") {
        await tg(token, "sendMessage", {
          chat_id: msg.chat.id, message_thread_id: msg.message_thread_id,
          text:
            "Pepper Aunie order bot 🛒\n\n" +
            "Setup (admins): open each order topic and send /bind, then tap the matching queue " +
            "(New Orders, To Prepare, To Ship, Completed, Cancelled).\n\n" +
            "New orders post automatically into New Orders. Use the buttons on each card to " +
            "Confirm → Ship → Complete (or Cancel). Confirm deducts inventory and marks the order paid.",
        });
      }
      return ok();
    }
  } catch (e) {
    console.error("webhook handler error:", (e as Error).message);
  }
  return ok();
});
