# PostHog setup: automated protocol emails

This runbook covers the PostHog side of Feature A. The code side (DB trigger, `protocol-delivery`,
`protocol-delivery-status`, admin "Protocol Emails" screen) is already in the repo.

> **Verify everything in the PostHog UI.** This was written without access to your PostHog project.
> Menu names below follow PostHog's public docs (Nov 2026) and may be worded slightly differently in your project.

## How it fits together

1. An order changes to **confirmed**, from the dashboard or from Telegram.
2. A Postgres trigger calls the `protocol-delivery` edge function. It records one `auto` row in
   `protocol_deliveries` and sends the PostHog event **`tbs_protocols_ready`** (`distinct_id` = customer email).
3. A PostHog **Workflow** triggered by that event sends the email (`emails/tbs_protocols_ready.html`).
4. PostHog records email engagement events (`$workflows_email_sent`, `_delivered`, `_failed`, `_bounced`, `_blocked`).
   An **HTTP Webhook Destination** forwards them to `protocol-delivery-status`, which updates the row.
5. Admin → Protocol Emails shows each row's status: *Handed off → Sent → Delivered*, or *Failed / Bounced / Skipped*.
   If no confirmation arrives within 30 minutes, the row shows as **Unconfirmed**. That usually means the
   Workflow is off or the webhook is not set up.

### Event properties on `tbs_protocols_ready`

| Property | Example / notes |
|---|---|
| `delivery_id` | uuid of the `protocol_deliveries` row |
| `order_id`, `order_number` | `PA-1042` |
| `customer_name`, `email` | |
| `subject` | `Your protocols for order PA-1042` |
| `protocol_count`, `protocol_names` | `2`, `Tirzepatide, BPC-157` |
| `protocols_html` | Ready-made protocol cards (HTML, every field already escaped server-side) |
| `protocols_text` | Plain-text version, including the portal link and password |
| `protocols` | Structured array for the fallback template (see *Escaping fallback*) |
| `portal_url` | `https://pepperanni.com/protocols` (`protocol_config.site_url` + `/protocols`) |
| `portal_password` | Current portal password, or `null` when none is set |
| `link_ttl_days` | `30` (signed download links expire after this) |
| `trigger_source` | `auto` or `manual` |
| `$set` | `{email, name}` on the person |

---

## Step 0: prerequisites (Supabase)

- Migrations applied, including `20261102000100_protocol_delivery.sql`.
- Vault secrets exist: `protocol_dispatch_secret` and `protocol_webhook_secret` (random, 32+ bytes each).
- `protocol_config` has `function_base_url` (for example `https://<project>.supabase.co/functions/v1`) and
  `posthog_project_key` (copied from `telegram_config` by the foundation migration; check it isn't null).
- Edge functions `protocol-delivery` and `protocol-delivery-status` are deployed with **`verify_jwt = false`**.
- A portal password is set (Admin → Protocols → Settings), or the email leaves out the password line.

```sql
select enabled, function_base_url, posthog_project_key is not null as has_key, site_url, link_ttl_days
from protocol_config;
```

## Step 1: the Workflow

1. In PostHog, open **Workflows** and choose **New workflow**. Name it **Protocol delivery**.
2. **Trigger:** event **`tbs_protocols_ready`**. No extra filters are needed. The edge function only sends this
   event when there is an email address and at least one protocol.
3. Add an **Email** step:
   - **From:** the same sender (address + display name) that your existing `tbs_order_*` workflows use. Open one of
     those workflows' email steps and copy the value. It must be on your verified sending domain.
   - **To:** `{{ event.properties.email }}`, matching how the existing `tbs_order_*` workflows address the person.
     If those use the person's email instead, do the same here.
   - **Subject:** `{{ event.properties.subject }}`. A fixed subject is fine too, but keep the word
     **"protocol"** in it (see Step 2, the subject guard).
   - **Body:** switch the editor to HTML or code mode, or use one full-width HTML block, and paste the whole of
     `emails/tbs_protocols_ready.html`.
   - Optional: turn **Track opens and link clicks** off. These are transactional emails, and the download links then
     stay exactly as signed. Delivered, bounce and failure events are still recorded either way.
4. **Settings → Workflows → Engagement events:** turn **Capture email engagement events** on. The status webhook
   depends on these events.
5. Save, then **Launch / Enable** the workflow.
6. Copy the workflow's id from its URL (`/workflows/<id>`). You need it in Step 2.

## Step 2: the status webhook (HTTP Webhook Destination)

1. **Data pipelines → + New → Destination**, search **Webhook** (HTTP Webhook) and choose **Create**.
2. **Webhook URL:** `https://<project>.supabase.co/functions/v1/protocol-delivery-status`
3. **Method:** `POST`.
4. **Headers:**
   ```json
   { "Content-Type": "application/json", "x-webhook-secret": "<value of Vault protocol_webhook_secret>" }
   ```
5. **Body:** paste this as-is (Hog template syntax with single braces):
   ```json
   {
     "event": "{event.event}",
     "distinct_id": "{event.distinct_id}",
     "timestamp": "{event.timestamp}",
     "properties": "{event.properties}"
   }
   ```
   The function also accepts PostHog's default body (`{"event": "{event}", "person": "{person}"}`).
   Prefer the body above because it doesn't send the whole person record.
6. **Filters → Events:** add these five events (match any):
   `$workflows_email_sent`, `$workflows_email_delivered`, `$workflows_email_failed`,
   `$workflows_email_bounced`, `$workflows_email_blocked`.
   On each one (or globally), add the property filter **`$workflow_id` equals `<Protocol delivery workflow id>`**,
   so emails from the `tbs_order_*` workflows are not forwarded.
7. Save and enable it. Turn on **Log responses** while you test.
8. Recommended server-side guard: store the workflow id so the function ignores any other workflow even if the
   destination filter is changed later:
   ```sql
   update protocol_config set status_workflow_id = '<Protocol delivery workflow id>' where id = true;
   ```
   While `status_workflow_id` is null, the function only accepts events whose `$email_subject` contains "protocol".

**How matching works:** engagement events carry `$email_to`, `$workflow_id` and `$email_subject`, but not our
`delivery_id`. The function therefore updates the **most recent** delivery for that email address (lowercase
match) from the **last 3 days** whose status can still move forward. Status only moves forward:
`pending/handed_off → sent → delivered`. A `failed` or `bounced` event records the reason.
A `blocked` event (spam complaint) keeps the row delivered and adds a note. Events that don't match return
`200 {matched:false}`, so PostHog does not retry them. Responses: `401` for a wrong secret, `5xx` for a
database error, which PostHog may retry.

## Step 3: test before go-live

1. **Preview:** Admin → Orders → open any order → *Protocol email* → **Preview**. Check the protocols, links and
   password. This sends nothing.
2. **Workflow test:** in the Workflow's email step, use **Test** with a sample `tbs_protocols_ready` event, or
   resend a real one and inspect it under Activity. Check that the protocol cards render as formatted boxes.
   If you see raw `<table ...>` text, go to *Escaping fallback*.
3. **End-to-end:** place an order with your own email, then confirm it in the dashboard (or Telegram). Within
   about a minute Admin → Protocol Emails should show **Handed off**, then **Sent**, then **Delivered**.
4. **Duplicate check:** set the same order back to *new* and confirm it again. No second automatic email should
   be sent (one `auto` row per order). **Resend** always sends a new, `manual` email with the latest protocols.
5. **Webhook check:** in the destination's logs, responses should be `200 {"matched":true,...}`.

Kill switch: `update protocol_config set enabled = false where id = true;` stops automatic sends (and the
10-minute sweep). Manual resends from the admin still work.

## Escaping: research finding and fallback

**Finding:** PostHog renders Workflow email bodies with LiquidJS configured with `outputEscape: 'escape'`, so
every `{{ ... }}` output is **HTML-escaped by default**. The email subject and plain-text part are rendered without
escaping. Source: PostHog's renderer `nodejs/src/cdp/utils/liquid.ts`
(https://github.com/PostHog/posthog/blob/master/nodejs/src/cdp/utils/liquid.ts: `createLiquid('escape')` for HTML,
`escapeHtml: false` only for plain-text keys). LiquidJS documents that with `outputEscape` set, the **`raw` filter**
outputs a value unescaped (https://liquidjs.com/tutorials/escaping.html). PostHog's docs
(https://posthog.com/docs/workflows/library) say templates use Liquid but say nothing about escaping.

So the template uses:

```liquid
{{ event.properties.protocols_html | raw }}
```

This is safe because `protocols_html` is built server-side with every field escaped, and only `http(s)` links are
emitted. All other fields in the template (name, order number, password, portal URL) are left escaped by PostHog.
Locally this was checked by rendering the template with LiquidJS 10.27.2 and `outputEscape: 'escape'`: the cards
rendered as HTML, and `<`/`&` in names and the password came out escaped once.

**Fallback: if `| raw` does not work in your project** (cards show as literal `<table ...>` text, or the editor
strips the filter), replace the single `{{ event.properties.protocols_html | raw }}` line in the template with this
loop over the structured `protocols` array. PostHog escapes each value itself. Use single quotes only inside
Liquid tags: the email builder breaks on double quotes.

```liquid
{% for p in event.properties.protocols %}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px; background-color: #FFF7FA; border: 1px solid #F2D3E0; border-radius: 12px;"><tr><td style="padding: 20px 22px;">
<p style="margin: 0; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 21px; font-weight: 600; color: #A8285A;">{{ p.name }}</p>
{% if p.for_products != blank %}<p style="margin: 4px 0 0; font-size: 12px; color: #925E7B;">{{ p.category }} &middot; For: {{ p.for_products }}</p>{% endif %}
{% if p.show_text %}
{% if p.dosage != blank %}<p style="margin: 10px 0 0; font-size: 14px; color: #4E2A3C;"><strong>Dosage:</strong> {{ p.dosage }}</p>{% endif %}
{% if p.frequency != blank %}<p style="margin: 4px 0 0; font-size: 14px; color: #4E2A3C;"><strong>Frequency:</strong> {{ p.frequency }}</p>{% endif %}
{% if p.duration != blank %}<p style="margin: 4px 0 0; font-size: 14px; color: #4E2A3C;"><strong>Duration:</strong> {{ p.duration }}</p>{% endif %}
{% if p.storage != blank %}<p style="margin: 4px 0 0; font-size: 14px; color: #4E2A3C;"><strong>Storage:</strong> {{ p.storage }}</p>{% endif %}
{% for n in p.notes %}<p style="margin: 4px 0 0; font-size: 14px; color: #4E2A3C;">&bull; {{ n }}</p>{% endfor %}
{% endif %}
{% if p.download_url != blank %}<p style="margin: 14px 0 0;"><a href="{{ p.download_url }}" style="display: inline-block; padding: 11px 22px; background-color: #A8285A; color: #FFFCFD; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 10px;">{{ p.download_label }}</a></p>{% elsif p.has_file %}<p style="margin: 12px 0 0; font-size: 13px; color: #925E7B;">This protocol is available in the protocol portal.</p>{% endif %}
</td></tr></table>
{% endfor %}
```

Each `protocols[]` item has: `name, category, for_products, show_text, dosage, frequency, duration, storage,
notes[], has_file, download_url, download_label`. This loop was also checked locally with escaping on.

**Last resort:** put `{{ event.properties.protocols_text }}` inside a `<pre style="white-space: pre-wrap; font-family: inherit;">`
block. It is plain text, so escaping does no harm.

## Troubleshooting

| Symptom in Admin → Protocol Emails | Likely cause |
|---|---|
| No row at all after confirming | `protocol_config.enabled` is false, `function_base_url` is null, Vault `protocol_dispatch_secret` is missing, or the function is not deployed with `verify_jwt = false`. Check `select * from net._http_response order by created desc limit 5;`. The 10-minute sweep retries orders confirmed in the last 48h. |
| **Skipped**: no active protocols | The ordered products have no active protocol assigned (Admin → Protocols, product assignment). |
| **Skipped**: no customer email | The order has no email. |
| **Failed**: PostHog capture HTTP … | Wrong `posthog_project_key` / `posthog_host` in `protocol_config`. |
| **Unconfirmed** (handed off more than 30 min ago) | The Workflow is not live, its trigger event is wrong, engagement events are off, or the webhook destination or its secret is wrong. |
| **Bounced / Failed** with a reason | Reported by PostHog. Fix the address and use **Resend**. |
