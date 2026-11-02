# Protocol Automation: Deploy Guide

Deploys Feature A (automated protocol emails) and Feature B (password-protected Protocol portal).
Do the steps **in order**. Deploy the site (Vercel) **after** steps 1–3. The new site needs the new
edge functions, and the old site can't read protocols once the lockdown migration runs.

Project ref: `fjtzqgnhfgrbwylgamcz` (from `supabase/config.toml`).

## 1. Create the Vault secrets
In the Supabase dashboard, open **SQL editor** and run this once, using your own random values (32+ characters each,
e.g. from `openssl rand -base64 32`):

```sql
select vault.create_secret('<random-1>', 'protocol_session_secret');   -- signs admin/portal sessions
select vault.create_secret('<random-2>', 'protocol_dispatch_secret');  -- DB trigger -> protocol-delivery
select vault.create_secret('<random-3>', 'protocol_webhook_secret');   -- PostHog -> protocol-delivery-status
```
Keep `<random-3>` handy. It goes into the PostHog webhook header in step 6.

## 2. Apply the migrations
```bash
supabase link --project-ref fjtzqgnhfgrbwylgamcz
supabase db push
```
Or paste these into the SQL editor, in this order:
1. `supabase/migrations/20261102000000_protocol_foundation.sql`
2. `supabase/migrations/20261102000100_protocol_delivery.sql`
3. `supabase/migrations/20261102000200_protocol_lockdown.sql`

Check that the config row picked up the edge-function URL and PostHog key from the Telegram config:
```sql
select enabled, function_base_url, posthog_project_key, site_url, link_ttl_days from protocol_config;
```
If `function_base_url` is empty, set it to `https://fjtzqgnhfgrbwylgamcz.supabase.co/functions/v1`.

## 3. Deploy the edge functions
```bash
supabase functions deploy admin-auth protocol-admin protocol-portal protocol-delivery protocol-delivery-status
```
`supabase/config.toml` already sets `verify_jwt = false` for all five. They do their own auth.

## 4. Deploy the website
Merge `feature/protocol-automation` and let Vercel build it. No new environment variables are needed.

## 5. Rotate the admin password (required)
The old admin password was in the public website code, so treat it as known to anyone.
1. Open `/admin` and log in with the **current** password.
2. A "Change admin password" screen blocks the dashboard. Set a new password (8+ characters).
3. Until you do this, protocol management and the Protocol Emails screen are refused on purpose.

Then go to **Admin → Protocols → Settings** and set the **portal password** that customers will use.

## 6. Set up PostHog
Follow `docs/protocol-automation/POSTHOG_SETUP.md`:
- Create the **Protocol delivery** Workflow (trigger `tbs_protocols_ready`, email template `emails/tbs_protocols_ready.html`).
- Create the **HTTP Webhook** Destination for the email engagement events (header `x-webhook-secret` = `<random-3>`).
- Optional, recommended: `update protocol_config set status_workflow_id = '<workflow id>';`

## 7. Assign protocols to products
In **Admin → Protocols**, open each protocol, tick the products it belongs to, and keep it **Active**
(Draft protocols are never emailed). Existing one-to-one links were carried over automatically.

## 8. Test end to end
1. **Admin → Protocol Emails**, or an order's detail → **Preview** to see the exact email.
2. Place a test order with your own email, then confirm it (dashboard or Telegram).
3. Within a minute the order shows **Handed off**, then **Sent** / **Delivered** once PostHog reports back.
4. Confirm the same order again (or move it back and forth). No second email should be sent.
5. Open `/protocols` on your phone: it asks for the portal password, then shows the guides.

## Switches and rollback
- Pause automatic emails: `update protocol_config set enabled = false;` (manual Resend still works).
- Past orders are never emailed on go-live. The 10-minute safety sweep only looks at orders confirmed after the migration ran.
- To roll back the portal lock, re-run `CREATE_PROTOCOL_FILES_BUCKET.sql` and restore the old policies from
  `supabase/migrations/20260112100000_create_protocols_table.sql`, then redeploy the previous site version.

## Known limits
- Only protocols are locked. Products, orders and other admin data still use the public key with open access.
  Hardening that is separate work.
- Protocol files uploaded earlier through ImageKit keep their public ImageKit links. Re-upload them in
  Admin → Protocols to move them into the private bucket.
- The wrong-password slowdown is per server instance. It slows guessing but isn't a hard rate limit.
