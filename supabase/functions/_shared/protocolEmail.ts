// Pure, dependency-free helpers for the protocol delivery email.
//
// No Deno APIs and no imports: this file is used by the `protocol-delivery` edge function AND imported
// directly by vitest (src/lib/protocolEmail.test.ts), so keep it plain TypeScript.
//
// Every value that came from the database (protocol fields, names, URLs, passwords) is HTML-escaped
// before it is placed in markup. Markup uses email-safe tables with inline styles only.

export interface OrderItemLike {
  product_id?: string | null;
  product_name?: string | null;
  [key: string]: unknown;
}

export interface AssignmentLike {
  product_id: string;
  protocol_id: string;
  sort_order?: number | null;
}

export interface ProtocolLike {
  id: string;
  name: string;
  category?: string | null;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  notes?: string[] | string | null;
  storage?: string | null;
  sort_order?: number | null;
  active?: boolean | null;
  version?: number | null;
  content_type?: string | null;
  file_url?: string | null;
  file_path?: string | null;
  /** Legacy single-product link, treated as an assignment. */
  product_id?: string | null;
}

export interface ResolvedProtocol extends ProtocolLike {
  /** Names of the ordered products this protocol belongs to (for "For: X" labels). */
  product_names: string[];
}

/** A resolved protocol plus the link the email should use for its file (signed URL or legacy file_url). */
export interface EmailProtocol extends ResolvedProtocol {
  download_url?: string | null;
}

export interface RenderOptions {
  portalUrl?: string | null;
  portalPassword?: string | null;
  linkTtlDays?: number | null;
}

/** Snapshot stored on protocol_deliveries.protocols. */
export interface ProtocolSnapshot {
  protocol_id: string;
  name: string;
  version: number;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Maps the products in an order to their ACTIVE protocols, deduplicated.
 * - `assignments` are product_protocols rows; `protocols.product_id` (legacy) also counts as an assignment.
 * - Order: by first ordered product that needs it, then assignment sort_order, then protocol sort_order, then name.
 * - Inactive protocols (active === false) are excluded; a missing `active` is treated as active.
 */
export function resolveOrderProtocols(
  orderItems: unknown,
  assignments: AssignmentLike[] | null | undefined,
  protocols: ProtocolLike[] | null | undefined,
): ResolvedProtocol[] {
  const items: OrderItemLike[] = Array.isArray(orderItems)
    ? (orderItems.filter((i) => i && typeof i === 'object') as OrderItemLike[])
    : [];
  const byId = new Map<string, ProtocolLike>();
  for (const p of protocols ?? []) if (p && p.id) byId.set(p.id, p);

  // product_id -> [{protocol_id, sort}]
  const links = new Map<string, { protocolId: string; sort: number }[]>();
  const addLink = (productId: string, protocolId: string, sort: number) => {
    const list = links.get(productId) ?? [];
    if (!list.some((l) => l.protocolId === protocolId)) list.push({ protocolId, sort });
    links.set(productId, list);
  };
  for (const a of assignments ?? []) {
    if (a?.product_id && a?.protocol_id) addLink(a.product_id, a.protocol_id, a.sort_order ?? 0);
  }
  for (const p of byId.values()) {
    if (p.product_id) addLink(p.product_id, p.id, Number.MAX_SAFE_INTEGER); // legacy: after explicit ones
  }

  const result: ResolvedProtocol[] = [];
  const seen = new Map<string, ResolvedProtocol>();
  items.forEach((item) => {
    const productId = item.product_id ? String(item.product_id) : '';
    if (!productId) return;
    const productName = item.product_name ? String(item.product_name) : '';
    const candidates = (links.get(productId) ?? [])
      .map((l) => ({ link: l, protocol: byId.get(l.protocolId) }))
      .filter((c): c is { link: { protocolId: string; sort: number }; protocol: ProtocolLike } =>
        !!c.protocol && c.protocol.active !== false,
      )
      .sort(
        (a, b) =>
          a.link.sort - b.link.sort ||
          (a.protocol.sort_order ?? 0) - (b.protocol.sort_order ?? 0) ||
          a.protocol.name.localeCompare(b.protocol.name),
      );
    for (const { protocol } of candidates) {
      const existing = seen.get(protocol.id);
      if (existing) {
        if (productName && !existing.product_names.includes(productName)) existing.product_names.push(productName);
        continue;
      }
      const resolved: ResolvedProtocol = { ...protocol, product_names: productName ? [productName] : [] };
      seen.set(protocol.id, resolved);
      result.push(resolved);
    }
  });
  return result;
}

export function snapshotProtocols(protocols: ProtocolLike[]): ProtocolSnapshot[] {
  return protocols.map((p) => ({ protocol_id: p.id, name: p.name, version: p.version ?? 1 }));
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) links are ever rendered as links. Anything else is dropped. */
export function safeUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export function normalizeNotes(notes: ProtocolLike['notes']): string[] {
  if (Array.isArray(notes)) return notes.map((n) => String(n ?? '').trim()).filter(Boolean);
  if (typeof notes === 'string') return notes.split(/\r?\n/).map((n) => n.trim()).filter(Boolean);
  return [];
}

export function hasFile(p: ProtocolLike): boolean {
  return !!(p.file_path || p.file_url);
}

/** Text content is shown for text protocols, and for any protocol that has text fields filled in. */
export function hasTextContent(p: ProtocolLike): boolean {
  const type = p.content_type || 'text';
  const anyField = [p.dosage, p.frequency, p.duration, p.storage].some((v) => !!(v && String(v).trim())) ||
    normalizeNotes(p.notes).length > 0;
  return type === 'text' ? true : anyField;
}

const COLORS = {
  heading: '#A8285A',
  text: '#4E2A3C',
  muted: '#925E7B',
  label: '#6B3C53',
  border: '#F2D3E0',
  card: '#FFF7FA',
  button: '#A8285A',
  buttonText: '#FFFCFD',
};
const FONT = "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

function fieldRow(label: string, value: string | null | undefined): string {
  if (!value || !String(value).trim()) return '';
  return (
    `<tr><td valign="top" width="96" style="padding: 4px 12px 4px 0; font-family: ${FONT}; font-size: 12px; ` +
    `font-weight: 600; color: ${COLORS.label}; text-transform: uppercase; letter-spacing: 0.06em;">${escapeHtml(label)}</td>` +
    `<td valign="top" style="padding: 4px 0; font-family: ${FONT}; font-size: 14px; color: ${COLORS.text}; line-height: 1.6;">` +
    `${escapeHtml(value)}</td></tr>`
  );
}

function fileLabel(p: ProtocolLike): string {
  return p.content_type === 'image' ? 'View protocol image' : 'Download protocol file';
}

function renderOneHtml(p: EmailProtocol, opts: RenderOptions): string {
  const parts: string[] = [];
  parts.push(
    `<p style="margin: 0; font-family: ${SERIF}; font-size: 21px; font-weight: 600; color: ${COLORS.heading}; line-height: 1.3;">${escapeHtml(p.name)}</p>`,
  );
  const meta = [p.category, p.product_names.length ? `For: ${p.product_names.join(', ')}` : '']
    .filter((v) => v && String(v).trim())
    .map((v) => escapeHtml(v))
    .join(' &middot; ');
  if (meta) {
    parts.push(`<p style="margin: 4px 0 0; font-family: ${FONT}; font-size: 12px; color: ${COLORS.muted};">${meta}</p>`);
  }

  if (hasTextContent(p)) {
    const rows = [
      fieldRow('Dosage', p.dosage),
      fieldRow('Frequency', p.frequency),
      fieldRow('Duration', p.duration),
      fieldRow('Storage', p.storage),
    ].join('');
    if (rows) {
      parts.push(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 12px;">${rows}</table>`,
      );
    }
    const notes = normalizeNotes(p.notes);
    if (notes.length) {
      parts.push(
        `<p style="margin: 12px 0 4px; font-family: ${FONT}; font-size: 12px; font-weight: 600; color: ${COLORS.label}; text-transform: uppercase; letter-spacing: 0.06em;">Notes</p>`,
      );
      parts.push(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` +
          notes
            .map(
              (n) =>
                `<tr><td valign="top" width="16" style="padding: 2px 0; font-family: ${FONT}; font-size: 14px; color: ${COLORS.heading};">&bull;</td>` +
                `<td style="padding: 2px 0; font-family: ${FONT}; font-size: 14px; color: ${COLORS.text}; line-height: 1.6;">${escapeHtml(n)}</td></tr>`,
            )
            .join('') +
          `</table>`,
      );
    }
  }

  if (hasFile(p)) {
    const url = safeUrl(p.download_url ?? null);
    if (url) {
      const ttl = opts.linkTtlDays ? `This link works for ${escapeHtml(opts.linkTtlDays)} days. ` : '';
      parts.push(
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top: 14px;"><tr>` +
          `<td style="border-radius: 10px; background-color: ${COLORS.button};">` +
          `<a href="${escapeHtml(url)}" target="_blank" style="display: inline-block; padding: 11px 22px; font-family: ${FONT}; ` +
          `font-size: 13px; font-weight: 600; color: ${COLORS.buttonText}; text-decoration: none; border-radius: 10px;">${fileLabel(p)}</a>` +
          `</td></tr></table>`,
      );
      parts.push(
        `<p style="margin: 8px 0 0; font-family: ${FONT}; font-size: 12px; color: ${COLORS.muted}; line-height: 1.5;">${ttl}` +
          `You can always find it in the protocol portal.</p>`,
      );
    } else {
      parts.push(
        `<p style="margin: 12px 0 0; font-family: ${FONT}; font-size: 13px; color: ${COLORS.muted};">This protocol is available in the protocol portal.</p>`,
      );
    }
  }

  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px; background-color: ${COLORS.card}; ` +
    `border: 1px solid ${COLORS.border}; border-radius: 12px;"><tr><td style="padding: 20px 22px;">${parts.join('')}</td></tr></table>`
  );
}

/** The protocol cards only (the template provides header, greeting, portal box and footer). */
export function renderProtocolsHtml(protocols: EmailProtocol[], opts: RenderOptions = {}): string {
  if (!protocols.length) return '';
  return protocols.map((p) => renderOneHtml(p, opts)).join('');
}

/** Portal access block, used by the preview and available to templates that cannot use `| raw`. */
export function renderPortalHtml(opts: RenderOptions): string {
  const url = safeUrl(opts.portalUrl ?? null);
  if (!url) return '';
  const pw = opts.portalPassword
    ? `<p style="margin: 8px 0 0; font-family: ${FONT}; font-size: 14px; color: ${COLORS.text};">Password: ` +
      `<strong style="font-family: 'Courier New', monospace; color: ${COLORS.heading};">${escapeHtml(opts.portalPassword)}</strong></p>`
    : '';
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #FCF8FA; border: 1px dashed ${COLORS.border}; border-radius: 12px;">` +
    `<tr><td style="padding: 18px 22px;">` +
    `<p style="margin: 0; font-family: ${SERIF}; font-size: 19px; font-weight: 600; color: ${COLORS.heading};">Protocol portal</p>` +
    `<p style="margin: 6px 0 0; font-family: ${FONT}; font-size: 14px; color: ${COLORS.text}; line-height: 1.6;">All protocols, always up to date: ` +
    `<a href="${escapeHtml(url)}" style="color: ${COLORS.heading}; font-weight: 600;">${escapeHtml(url)}</a></p>${pw}` +
    `</td></tr></table>`
  );
}

/** Plain-text version (for the email's text part and the preview). */
export function renderProtocolsText(protocols: EmailProtocol[], opts: RenderOptions = {}): string {
  const blocks = protocols.map((p) => {
    const lines: string[] = [p.name.toUpperCase()];
    const meta = [p.category, p.product_names.length ? `For: ${p.product_names.join(', ')}` : ''].filter(Boolean);
    if (meta.length) lines.push(meta.join(' - '));
    if (hasTextContent(p)) {
      if (p.dosage) lines.push(`Dosage: ${p.dosage}`);
      if (p.frequency) lines.push(`Frequency: ${p.frequency}`);
      if (p.duration) lines.push(`Duration: ${p.duration}`);
      if (p.storage) lines.push(`Storage: ${p.storage}`);
      const notes = normalizeNotes(p.notes);
      if (notes.length) {
        lines.push('Notes:');
        for (const n of notes) lines.push(`- ${n}`);
      }
    }
    if (hasFile(p)) {
      const url = safeUrl(p.download_url ?? null);
      lines.push(url ? `${fileLabel(p)}: ${url}` : 'Available in the protocol portal.');
    }
    return lines.join('\n');
  });
  const portalUrl = safeUrl(opts.portalUrl ?? null);
  if (portalUrl) {
    const portal = [`Protocol portal: ${portalUrl}`];
    if (opts.portalPassword) portal.push(`Password: ${opts.portalPassword}`);
    blocks.push(portal.join('\n'));
  }
  return blocks.join('\n\n');
}

/** Plain structured data for the Liquid `{% for %}` fallback template (PostHog escapes these values itself). */
export interface TemplateProtocol {
  name: string;
  category: string;
  for_products: string;
  show_text: boolean;
  dosage: string;
  frequency: string;
  duration: string;
  storage: string;
  notes: string[];
  has_file: boolean;
  download_url: string;
  download_label: string;
}

export function toTemplateProtocols(protocols: EmailProtocol[]): TemplateProtocol[] {
  return protocols.map((p) => {
    const showText = hasTextContent(p);
    return {
      name: p.name,
      category: p.category ?? '',
      for_products: p.product_names.join(', '),
      show_text: showText,
      dosage: showText ? p.dosage ?? '' : '',
      frequency: showText ? p.frequency ?? '' : '',
      duration: showText ? p.duration ?? '' : '',
      storage: showText ? p.storage ?? '' : '',
      notes: showText ? normalizeNotes(p.notes) : [],
      has_file: hasFile(p),
      download_url: safeUrl(p.download_url ?? null) ?? '',
      download_label: fileLabel(p),
    };
  });
}

export function buildSubject(orderNumber: string | null | undefined, protocolCount: number): string {
  const what = protocolCount === 1 ? 'Your protocol' : 'Your protocols';
  return orderNumber ? `${what} for order ${orderNumber}` : `${what} from PepperAnni`;
}

/** Standalone HTML used by the admin "Preview" (approximates the PostHog template). */
export function renderPreviewHtml(
  protocols: EmailProtocol[],
  opts: RenderOptions & { customerName?: string | null; orderNumber?: string | null },
): string {
  const greeting = `Hi ${escapeHtml(opts.customerName || 'there')}, here are the protocols for order ` +
    `<strong style="color: #C53A6E;">${escapeHtml(opts.orderNumber || '')}</strong>.`;
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #FCF8FA;"><tr><td align="center" style="padding: 24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #FFFFFF; border-radius: 16px;">` +
    `<tr><td style="padding: 28px 28px 8px;"><p style="margin: 0 0 8px; font-family: ${SERIF}; font-size: 26px; color: #2B1019;">Your protocols are ready</p>` +
    `<p style="margin: 0; font-family: ${FONT}; font-size: 15px; color: ${COLORS.text}; line-height: 1.7;">${greeting}</p></td></tr>` +
    `<tr><td style="padding: 16px 28px 0;">${renderProtocolsHtml(protocols, opts)}</td></tr>` +
    `<tr><td style="padding: 0 28px 28px;">${renderPortalHtml(opts)}</td></tr>` +
    `</table></td></tr></table>`
  );
}
