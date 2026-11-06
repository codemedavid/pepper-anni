import { describe, it, expect } from 'vitest';
import {
  resolveOrderProtocols,
  renderProtocolsHtml,
  renderProtocolsText,
  renderPortalHtml,
  buildSubject,
  escapeHtml,
  snapshotProtocols,
  toTemplateProtocols,
  type ProtocolLike,
  type EmailProtocol,
} from '../../supabase/functions/_shared/protocolEmail';

const textProtocol = (over: Partial<ProtocolLike> = {}): ProtocolLike => ({
  id: 'p-text',
  name: 'Tirzepatide',
  category: 'Weight Management',
  dosage: '2.5mg weekly',
  frequency: 'Once weekly',
  duration: '12 weeks',
  notes: ['Rotate injection sites', 'Stay hydrated'],
  storage: 'Refrigerate at 2-8C',
  sort_order: 1,
  active: true,
  version: 3,
  content_type: 'text',
  file_url: null,
  file_path: null,
  ...over,
});

const fileProtocol = (over: Partial<ProtocolLike> = {}): ProtocolLike => ({
  id: 'p-file',
  name: 'Reconstitution Guide',
  category: 'Guides',
  dosage: '',
  frequency: '',
  duration: '',
  notes: [],
  storage: '',
  sort_order: 2,
  active: true,
  version: 1,
  content_type: 'file',
  file_path: 'guides/recon.pdf',
  ...over,
});

const items = (...ids: string[]) =>
  ids.map((id, i) => ({ product_id: id, product_name: `Product ${id}`, variation_id: null, quantity: 1, price: 100 + i }));

describe('resolveOrderProtocols', () => {
  it('deduplicates a protocol shared by two products in one order', () => {
    const protocols = [textProtocol(), fileProtocol()];
    const assignments = [
      { product_id: 'A', protocol_id: 'p-text', sort_order: 0 },
      { product_id: 'A', protocol_id: 'p-file', sort_order: 1 },
      { product_id: 'B', protocol_id: 'p-text', sort_order: 0 },
    ];
    const result = resolveOrderProtocols(items('A', 'B'), assignments, protocols);
    expect(result.map((p) => p.id)).toEqual(['p-text', 'p-file']);
    expect(result[0].product_names).toEqual(['Product A', 'Product B']);
  });

  it('collapses duplicate line items of the same product', () => {
    const result = resolveOrderProtocols(
      items('A', 'A'),
      [{ product_id: 'A', protocol_id: 'p-text' }],
      [textProtocol()],
    );
    expect(result).toHaveLength(1);
    expect(result[0].product_names).toEqual(['Product A']);
  });

  it('excludes inactive protocols', () => {
    const result = resolveOrderProtocols(
      items('A'),
      [
        { product_id: 'A', protocol_id: 'p-text' },
        { product_id: 'A', protocol_id: 'p-file' },
      ],
      [textProtocol({ active: false }), fileProtocol()],
    );
    expect(result.map((p) => p.id)).toEqual(['p-file']);
  });

  it('treats the legacy protocols.product_id as an assignment', () => {
    const result = resolveOrderProtocols(items('LEGACY'), [], [textProtocol({ product_id: 'LEGACY' })]);
    expect(result.map((p) => p.id)).toEqual(['p-text']);
  });

  it('does not double count a protocol linked both ways', () => {
    const result = resolveOrderProtocols(
      items('A'),
      [{ product_id: 'A', protocol_id: 'p-text' }],
      [textProtocol({ product_id: 'A' })],
    );
    expect(result).toHaveLength(1);
  });

  it('orders by assignment sort_order', () => {
    const result = resolveOrderProtocols(
      items('A'),
      [
        { product_id: 'A', protocol_id: 'p-text', sort_order: 5 },
        { product_id: 'A', protocol_id: 'p-file', sort_order: 1 },
      ],
      [textProtocol(), fileProtocol()],
    );
    expect(result.map((p) => p.id)).toEqual(['p-file', 'p-text']);
  });

  it('returns nothing when no product has protocols, or order_items is malformed', () => {
    expect(resolveOrderProtocols(items('X'), [{ product_id: 'A', protocol_id: 'p-text' }], [textProtocol()])).toEqual([]);
    expect(resolveOrderProtocols(null, [], [textProtocol()])).toEqual([]);
    expect(resolveOrderProtocols('nope', [], [])).toEqual([]);
  });

  it('snapshots id, name and version', () => {
    expect(snapshotProtocols([textProtocol()])).toEqual([{ protocol_id: 'p-text', name: 'Tirzepatide', version: 3 }]);
  });
});

describe('rendering', () => {
  const resolve = (ps: ProtocolLike[]): EmailProtocol[] =>
    resolveOrderProtocols(
      items('A'),
      ps.map((p, i) => ({ product_id: 'A', protocol_id: p.id, sort_order: i })),
      ps,
    );

  it('writes text protocols out inline', () => {
    const html = renderProtocolsHtml(resolve([textProtocol()]));
    expect(html).toContain('Tirzepatide');
    expect(html).toContain('2.5mg weekly');
    expect(html).toContain('Once weekly');
    expect(html).toContain('12 weeks');
    expect(html).toContain('Rotate injection sites');
    expect(html).toContain('Refrigerate at 2-8C');
    expect(html).not.toContain('Download protocol file');
  });

  it('renders file protocols as a download link instead of text fields', () => {
    const [p] = resolve([fileProtocol()]);
    const html = renderProtocolsHtml([{ ...p, download_url: 'https://x.supabase.co/sign/guides/recon.pdf?token=abc' }], {
      linkTtlDays: 30,
    });
    expect(html).toContain('href="https://x.supabase.co/sign/guides/recon.pdf?token=abc"');
    expect(html).toContain('Download protocol file');
    expect(html).toContain('30 days');
    expect(html).not.toContain('Dosage');
  });

  it('labels image protocols and falls back to the portal when no link is available', () => {
    const [p] = resolve([fileProtocol({ content_type: 'image' })]);
    expect(renderProtocolsHtml([{ ...p, download_url: 'https://cdn/x.png' }])).toContain('View protocol image');
    expect(renderProtocolsHtml([{ ...p, download_url: null }])).toContain('available in the protocol portal');
  });

  it('never renders non-http links', () => {
    const [p] = resolve([fileProtocol()]);
    const html = renderProtocolsHtml([{ ...p, download_url: 'javascript:alert(1)' }]);
    expect(html).not.toContain('javascript:');
  });

  it('HTML-escapes every user-provided field', () => {
    const evil = '<script>alert("x")</script>';
    const [p] = resolve([
      textProtocol({ name: evil, category: evil, dosage: evil, frequency: evil, duration: evil, storage: evil, notes: [evil] }),
    ]);
    const html = renderProtocolsHtml([{ ...p, product_names: [evil] }]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    const portal = renderPortalHtml({ portalUrl: 'https://pepperanni.com/protocols', portalPassword: '<b>pw</b>' });
    expect(portal).toContain('&lt;b&gt;pw&lt;/b&gt;');
    expect(escapeHtml(`a&b'c`)).toBe('a&amp;b&#39;c');
  });

  it('plain text includes fields, links, portal and password', () => {
    const [t, f] = resolve([textProtocol(), fileProtocol()]);
    const text = renderProtocolsText([t, { ...f, download_url: 'https://signed/file' }], {
      portalUrl: 'https://pepperanni.com/protocols',
      portalPassword: 'glow2026',
    });
    expect(text).toContain('TIRZEPATIDE');
    expect(text).toContain('Dosage: 2.5mg weekly');
    expect(text).toContain('- Stay hydrated');
    expect(text).toContain('Download protocol file: https://signed/file');
    expect(text).toContain('Protocol portal: https://pepperanni.com/protocols');
    expect(text).toContain('Password: glow2026');
  });

  it('uses the one-click portal link for the button and text, but shows the plain URL', () => {
    const opts = {
      portalUrl: 'https://pepperanni.com/protocols',
      portalLinkUrl: 'https://pepperanni.com/protocols#access=abc.def',
      portalPassword: 'glow2026',
    };
    const portal = renderPortalHtml(opts);
    expect(portal).toContain('href="https://pepperanni.com/protocols#access=abc.def"');
    expect(portal).toContain('>https://pepperanni.com/protocols</a>');
    expect(renderProtocolsText([], opts)).toContain('Protocol portal: https://pepperanni.com/protocols#access=abc.def');
  });

  it('omits the password line when there is none', () => {
    const text = renderProtocolsText([], { portalUrl: 'https://pepperanni.com/protocols', portalPassword: null });
    expect(text).not.toContain('Password');
    expect(renderPortalHtml({ portalUrl: 'https://pepperanni.com/protocols' })).not.toContain('Password');
  });

  it('renders nothing for the no-protocol case', () => {
    expect(renderProtocolsHtml([])).toBe('');
    expect(renderProtocolsText([])).toBe('');
  });

  it('builds the template array for the Liquid fallback', () => {
    const [t, f] = resolve([textProtocol(), fileProtocol()]);
    const arr = toTemplateProtocols([t, { ...f, download_url: 'https://signed/file' }]);
    expect(arr[0]).toMatchObject({ name: 'Tirzepatide', show_text: true, has_file: false, notes: ['Rotate injection sites', 'Stay hydrated'] });
    expect(arr[1]).toMatchObject({ show_text: false, has_file: true, download_url: 'https://signed/file' });
  });

  it('builds the subject', () => {
    expect(buildSubject('PA-1042', 2)).toBe('Your protocols for order PA-1042');
    expect(buildSubject('PA-1042', 1)).toBe('Your protocol for order PA-1042');
    expect(buildSubject(null, 3)).toBe('Your protocols from PepperAnni');
  });
});
