// protocol-delivery-status: receives PostHog email engagement events and moves protocol_deliveries forward.
//
// DEPLOY WITH verify_jwt = false (PostHog cannot send a Supabase JWT). Auth: header `x-webhook-secret`
// must equal Vault `protocol_webhook_secret` (constant-time compare).
//
// Configure a PostHog "HTTP Webhook" Destination (see docs/protocol-automation/POSTHOG_SETUP.md):
//   Events:  $workflows_email_sent, $workflows_email_delivered, $workflows_email_failed,
//            $workflows_email_bounced, $workflows_email_blocked
//   Filter:  $workflow_id = <Protocol delivery workflow id>
//   Header:  x-webhook-secret: <protocol_webhook_secret>
//   Body (recommended):
//     {"event": "{event.event}", "distinct_id": "{event.distinct_id}", "timestamp": "{event.timestamp}",
//      "properties": "{event.properties}"}
//   The PostHog default body {"event": "{event}", "person": "{person}"} is accepted too.
//
// Engagement events carry $email_to / $workflow_id / $email_subject but NOT our delivery_id, so we match the
// most recent eligible delivery for lower(customer_email) created within the last 3 days.
// Status only moves forward: pending/handed_off -> sent -> delivered; failures are recorded with a reason.
// Unmatched or ignored events return 200 so PostHog does not retry them.
import { admin, errorJson, getSecret, json, preflight, readJson, safeEqual } from "../_shared/http.ts";

const MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

type Kind = "sent" | "delivered" | "failed" | "bounced" | "blocked";

const EVENT_KIND: Record<string, Kind> = {
  $workflows_email_sent: "sent",
  $workflows_email_delivered: "delivered",
  $workflows_email_failed: "failed",
  $workflows_email_bounced: "bounced",
  $workflows_email_blocked: "blocked",
};

/** Which current statuses each event may move FROM (forward-only state machine). */
const ELIGIBLE_FROM: Record<Kind, string[]> = {
  sent: ["pending", "handed_off"],
  delivered: ["pending", "handed_off", "sent"],
  failed: ["pending", "handed_off", "sent"],
  // A bounce can arrive after the receiving server first accepted the message.
  bounced: ["pending", "handed_off", "sent", "delivered"],
  // Spam complaint: the email reached the inbox. Recorded as a note, status becomes/stays delivered.
  blocked: ["pending", "handed_off", "sent", "delivered"],
};

interface Incoming {
  name: string;
  props: Record<string, unknown>;
  distinctId: string | null;
  timestamp: string | null;
}

function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* not json */ }
  }
  return {};
}

/** Accepts the recommended flat body, the PostHog default {event:{...},person:{...}} body, or a stringified event. */
function parseBody(body: Record<string, unknown>): Incoming {
  const ev = asObject(body.event);
  if (Object.keys(ev).length && typeof ev.event === "string") {
    return {
      name: ev.event,
      props: asObject(ev.properties),
      distinctId: typeof ev.distinct_id === "string" ? ev.distinct_id : null,
      timestamp: typeof ev.timestamp === "string" ? ev.timestamp : null,
    };
  }
  return {
    name: typeof body.event === "string" ? body.event : "",
    props: asObject(body.properties),
    distinctId: typeof body.distinct_id === "string" ? body.distinct_id : null,
    timestamp: typeof body.timestamp === "string" ? body.timestamp : null,
  };
}

/** "Jane <jane@x.com>" or "jane@x.com" -> "jane@x.com" */
function extractEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/[^\s<>"',;]+@[^\s<>"',;]+/);
  return m ? m[0].toLowerCase() : null;
}

function failureReason(kind: Kind, props: Record<string, unknown>): string {
  const keys = [
    "$email_failure_reason",
    "$failure_reason",
    "$email_error",
    "$error",
    "$bounce_type",
    "$email_bounce_type",
    "reason",
    "error",
  ];
  const detail = keys.map((k) => props[k]).find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const label = kind === "bounced" ? "Bounced" : kind === "blocked" ? "Marked as spam by recipient" : "Send failed";
  return (detail ? `${label}: ${detail}` : `${label} (reported by PostHog)`).slice(0, 500);
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return errorJson("method not allowed", 405);

  const secret = await getSecret("protocol_webhook_secret");
  if (!secret || !safeEqual(req.headers.get("x-webhook-secret"), secret)) return errorJson("unauthorized", 401);

  try {
    const incoming = parseBody(await readJson<Record<string, unknown>>(req));
    const kind = EVENT_KIND[incoming.name];
    if (!kind) return json({ ok: true, ignored: `unsupported event ${incoming.name || "(none)"}` });

    // Only events from the protocol workflow count (other workflows email the same customers).
    const { data: cfg } = await admin.from("protocol_config").select("status_workflow_id").eq("id", true).maybeSingle();
    const wantWorkflow = (cfg?.status_workflow_id as string | null) ?? null;
    const workflowId = typeof incoming.props.$workflow_id === "string" ? incoming.props.$workflow_id : null;
    const subject = typeof incoming.props.$email_subject === "string" ? incoming.props.$email_subject : "";
    if (wantWorkflow ? workflowId !== wantWorkflow : !/protocol/i.test(subject)) {
      return json({ ok: true, ignored: "not the protocol workflow" });
    }

    const email = extractEmail(incoming.props.$email_to) ?? extractEmail(incoming.distinctId);
    if (!email) return json({ ok: true, ignored: "no recipient email" });

    const since = new Date(Date.now() - MATCH_WINDOW_MS).toISOString();
    const { data: rows, error } = await admin
      .from("protocol_deliveries")
      .select("id, status, sent_at, delivered_at, status_reason")
      .ilike("customer_email", escapeLike(email))
      .in("status", ELIGIBLE_FROM[kind])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) {
      console.error("match delivery:", error.message);
      return errorJson("lookup failed", 500); // 5xx: let PostHog retry
    }
    const row = rows?.[0];
    if (!row) return json({ ok: true, matched: false });

    const at = incoming.timestamp && !Number.isNaN(Date.parse(incoming.timestamp))
      ? new Date(incoming.timestamp).toISOString()
      : new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    switch (kind) {
      case "sent":
        Object.assign(patch, { status: "sent", sent_at: at, status_reason: null });
        break;
      case "delivered":
        Object.assign(patch, { status: "delivered", delivered_at: at, sent_at: row.sent_at ?? at, status_reason: null });
        break;
      case "failed":
      case "bounced":
        Object.assign(patch, { status: kind, failed_at: at, status_reason: failureReason(kind, incoming.props) });
        break;
      case "blocked":
        Object.assign(patch, {
          status: "delivered",
          delivered_at: row.delivered_at ?? at,
          sent_at: row.sent_at ?? at,
          status_reason: failureReason(kind, incoming.props),
        });
        break;
    }

    // Conditional on the status we read, so concurrent events can't move a row backwards.
    const { data: updated, error: upErr } = await admin
      .from("protocol_deliveries")
      .update(patch)
      .eq("id", row.id)
      .eq("status", row.status)
      .select("id, status")
      .maybeSingle();
    if (upErr) {
      console.error("update delivery:", upErr.message);
      return errorJson("update failed", 500);
    }
    return json({ ok: true, matched: true, delivery_id: row.id, status: updated?.status ?? row.status, raced: !updated });
  } catch (e) {
    console.error("protocol-delivery-status error:", e);
    return errorJson("internal error", 500);
  }
});
