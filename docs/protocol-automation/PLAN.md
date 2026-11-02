# Protocol Automation: Build Plan

Covers **Feature A** (automated protocol delivery emails through PostHog Workflows) and
**Feature B** (password-protected Protocol portal with a real, server-enforced lock).

Decisions (confirmed by owner):
- Lock strength: **real lock**. The server checks the password, protocol data and files are served only
  after unlock, and protocol admin writes go through a server check.
- Email trigger: **order becomes `confirmed`** (from the dashboard or the Telegram bot).
- Email body: **inline text protocols + 30-day signed download links for file/image protocols + portal link
  and current portal password**.

---

## 1. What exists today (and why it shapes the design)

| Area | Today | Consequence |
|---|---|---|
| Customer emails | Browser/edge code fires `tbs_order_*` events to PostHog. PostHog Workflows send `emails/*.html` using `{{ event.properties.* }}` | Feature A reuses this: fire a new event `tbs_protocols_ready`, add one new Workflow + template |
| Status changes | Two entry points: admin dashboard (`OrdersManager.tsx`, direct table update) and Telegram bot (`tg_confirm_order` RPC) | Hook in **one place**: a Postgres trigger on `orders`, same pattern as `notify_telegram_order` (pg_net + Vault) |
| Protocols | `protocols` table, RLS on, but policy `FOR ALL USING (true)` lets anyone read and write. `protocol-files` bucket is public | Must be locked down for Feature B. Edge functions use service role |
| Product link | `protocols.product_id` (one product per protocol) | Add a `product_protocols` join table (many-to-many), backfilled |
| Admin auth | Password compared **in the browser**; it is hard-coded in the public JS bundle and git history | A real lock needs server-side admin auth. Admin login moves to an edge function that issues a signed token. **The current admin password must be rotated after deploy** |

---

## 2. Architecture

```
 Dashboard confirm ─┐
                    ├─► orders.order_status → 'confirmed'
 Telegram confirm ──┘            │
                                 ▼  AFTER UPDATE trigger (pg_net, exception-safe)
                       edge fn: protocol-delivery  (x-dispatch-secret)
                         1. INSERT protocol_deliveries (unique per order for 'auto') ← duplicate guard
                         2. resolve order_items → product_protocols → active protocols (latest version)
                         3. render protocols_html, sign 30-day URLs for files
                         4. POST PostHog /capture  event=tbs_protocols_ready  distinct_id=email
                         5. status = handed_off (or failed / skipped + reason)
                                 ▼
                       PostHog Workflow "Protocol delivery" → Email step (existing sender)
                                 ▼
                       PostHog engagement events ($workflows_email_sent / _delivered / _failed / _bounced)
                                 ▼  PostHog Destination: HTTP webhook (x-webhook-secret)
                       edge fn: protocol-delivery-status → protocol_deliveries.status = sent/delivered/failed/bounced

 Admin dashboard ── admin token ─► protocol-delivery  {action:list|resend}
                                   protocol-admin     {CRUD, assignments, portal password, upload URL}
 /protocols page ── password ────► protocol-portal    {unlock → portal token; list → protocols + signed URLs}
 /admin login ───── password ────► admin-auth         {login → admin token; change_password}
```

### Delivery status lifecycle
`pending` → `handed_off` (PostHog accepted the event) → `sent` → `delivered`
Failure branches: `failed` (our side or PostHog reported failure), `bounced`, `skipped` (no email / no protocols).
A `handed_off` row with no confirmation after 30 minutes shows as **"Unconfirmed"** in the dashboard, so a
missing workflow or webhook is visible.

### Duplicate prevention
- Trigger fires only when `OLD.order_status IS DISTINCT FROM 'confirmed' AND NEW.order_status = 'confirmed'`.
- Hard guarantee: partial unique index `protocol_deliveries(order_id) WHERE trigger_source = 'auto'`.
  Re-confirming, retries, and pg_net re-deliveries all collapse to one auto email.
- Manual resends create new rows (`trigger_source = 'manual'`) on purpose.

### Protocol versioning
`protocols.version` auto-increments when content changes (trigger). Each delivery stores a snapshot
`[{protocol_id, name, version}]`. Emails are always built at send time from the active (published) rows,
so updates apply to all future emails. Inactive = unpublished/draft.

---

## 3. Shared contract (foundation, built first)

**Migration** `supabase/migrations/20261102000000_protocol_foundation.sql`
- `protocols`: `+ version int`, `+ file_path text` (object path inside private bucket `protocol-files`), version-bump trigger
- `product_protocols(product_id, protocol_id, sort_order)`: backfilled from `protocols.product_id`
- `protocol_portal_settings` (singleton, service-role only): `password_hash`, `password_plain`, `password_version`, `portal_url`
- `admin_credentials` (singleton, service-role only): `password_hash`, `password_version`, `must_rotate`
- `protocol_deliveries`: see migration for columns
- `protocol_config` (singleton, service-role only): `enabled`, `function_base_url`, `posthog_project_key`, `posthog_host`, `link_ttl_days`
- Vault secrets (provisioned at deploy, never committed): `protocol_session_secret`, `protocol_dispatch_secret`, `protocol_webhook_secret`
- `protocol_get_secret(name)`: SECURITY DEFINER, service_role only, `protocol\_%` namespace

**Shared edge code** `supabase/functions/_shared/`
- `session.ts`: `signToken({role:'admin'|'portal', pv})`, `verifyToken(token, role)` (HMAC-SHA256, expiry,
  password-version check so a password change logs everyone out)
- `http.ts`: CORS, json helpers, `safeEqual`, service-role client

**Client** `src/lib/edgeApi.ts`: `callEdge(fn, body, {token})`; `src/lib/adminSession.ts`: get/set/clear admin token.

---

## 4. Work breakdown and file ownership

Two tracks run in parallel after the foundation. Each owns its files outright, so they never edit the same file.

### Track A: Automated Protocol Delivery
| Item | Files (owned) |
|---|---|
| Dispatch trigger on `orders` → pg_net | `supabase/migrations/20261102000100_protocol_delivery.sql` |
| Dispatch + admin list/resend | `supabase/functions/protocol-delivery/index.ts` |
| PostHog status webhook receiver | `supabase/functions/protocol-delivery-status/index.ts` |
| Email template | `emails/tbs_protocols_ready.html` |
| Pure helpers (HTML render, product→protocol resolve) + unit tests | `supabase/functions/_shared/protocolEmail.ts`, `src/lib/protocolEmail.test.ts` |
| Admin "Protocol Emails" screen (status, failed filter, resend, unconfirmed flag) | `src/components/ProtocolDeliveriesManager.tsx` (+ test) |
| Per-order protocol email badge + resend | `src/components/OrdersManager.tsx` |
| PostHog setup runbook | `docs/protocol-automation/POSTHOG_SETUP.md` |

### Track B: Password-Protected Portal and Real Lock
| Item | Files (owned) |
|---|---|
| Lock RLS on `protocols`, private bucket, backfill `file_path` | `supabase/migrations/20261102000200_protocol_lockdown.sql` |
| Admin login + change admin password | `supabase/functions/admin-auth/index.ts` |
| Protocol CRUD, product assignment, portal password, signed upload URL | `supabase/functions/protocol-admin/index.ts` |
| Portal unlock + list (signed file URLs) | `supabase/functions/protocol-portal/index.ts` |
| Hooks via edge API | `src/hooks/useProtocols.ts` (+ test update) |
| Unlock screen (mobile-first) + gated guide | `src/components/ProtocolGuide.tsx` (+ test update) |
| Product assignment + portal password settings in admin | `src/components/ProtocolManager.tsx` (+ test update), `src/components/ProtocolSettings.tsx` |
| Server admin login, protocol auto-generate via edge API | `src/components/AdminDashboard.tsx` |

### Integration (orchestrator)
Wire the "Protocol Emails" tile into the AdminDashboard after both tracks finish. Full lint, type-check, tests and
build. Write `docs/protocol-automation/DEPLOY.md`. Commit and push.

---

## 5. Deploy checklist (owner, after merge)
1. Apply migrations (Supabase SQL editor or `supabase db push`).
2. Create the Vault secrets (random 32+ bytes each).
3. Deploy edge functions: `admin-auth`, `protocol-admin`, `protocol-portal`, `protocol-delivery`,
   `protocol-delivery-status`, all with `verify_jwt = false` (they do their own auth).
4. Log in to `/admin` with the **current** password, then **change it immediately** (the old one is public).
5. Set the portal password in Admin → Protocols → Settings.
6. In PostHog: create the "Protocol delivery" Workflow (trigger `tbs_protocols_ready`, email step with
   `emails/tbs_protocols_ready.html`) and the HTTP-webhook Destination for engagement events (see `POSTHOG_SETUP.md`).
7. Place a test order with your own email, confirm it, and check the Protocol Emails screen reaches `delivered`.

## 6. Risks / open items
- **PostHog template escaping:** if the email step HTML-escapes `{{ event.properties.protocols_html }}`, use the
  fallback described in `POSTHOG_SETUP.md`. Test with the Workflow's "test" button before going live.
- **Sender:** this reuses whatever email channel the existing `tbs_order_*` workflows already use. PostHog
  Workflows sends from a verified sender domain. It can't be checked from the repo.
- **The rest of the admin dashboard** (products, orders, etc.) still writes with the public anon key under open
  RLS. Feature B locks protocols only. Hardening the whole admin is a separate job.
