import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Mail, RefreshCw, Search, Send, Eye, X, AlertTriangle } from 'lucide-react';
import { callEdge, EdgeError } from '../lib/edgeApi';
import { getAdminToken } from '../lib/adminSession';

// Admin screen for automated protocol emails (edge function `protocol-delivery`).

export interface ProtocolDelivery {
  id: string;
  order_id: string;
  order_number: string | null;
  customer_email: string | null;
  customer_name: string | null;
  trigger_source: 'auto' | 'manual';
  status: 'pending' | 'handed_off' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'skipped';
  status_reason: string | null;
  protocols: { protocol_id: string; name: string; version: number }[] | null;
  attempts: number;
  handed_off_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  created_at: string;
  unconfirmed?: boolean;
}

interface ListResponse {
  deliveries: ProtocolDelivery[];
  total: number;
}

interface PreviewResponse {
  to: string | null;
  subject: string;
  html: string;
  text: string;
  protocols: { protocol_id: string; name: string; version: number }[];
  would_skip: string | null;
  auto_enabled?: boolean;
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'failed', label: 'Failed' },
  { key: 'unconfirmed', label: 'Unconfirmed' },
  { key: 'sent', label: 'Sent' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'skipped', label: 'Skipped' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

const PAGE_SIZE = 50;

const edge = <T,>(body: Record<string, unknown>) => callEdge<T>('protocol-delivery', body, { token: getAdminToken() });

function errorMessage(err: unknown): string {
  if (err instanceof EdgeError && err.status === 401) return 'Your admin session has expired. Please log in again.';
  return err instanceof Error ? err.message : 'Something went wrong';
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-gray-100 text-gray-700 border-gray-300' },
  handed_off: { label: 'Handed off', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  sent: { label: 'Sent', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  delivered: { label: 'Delivered', cls: 'bg-green-50 text-green-700 border-green-200' },
  failed: { label: 'Failed', cls: 'bg-red-50 text-red-700 border-red-200' },
  bounced: { label: 'Bounced', cls: 'bg-red-50 text-red-700 border-red-200' },
  skipped: { label: 'Skipped', cls: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
};

export const DeliveryStatusBadge: React.FC<{ delivery: Pick<ProtocolDelivery, 'status' | 'unconfirmed'> }> = ({ delivery }) => {
  if (delivery.unconfirmed) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border bg-amber-50 text-amber-800 border-amber-300"
        title="PostHog accepted the event but no sent/delivered confirmation arrived within 30 minutes. Check the Workflow and the status webhook."
      >
        <AlertTriangle className="w-3 h-3" /> Unconfirmed
      </span>
    );
  }
  const s = STATUS_STYLES[delivery.status] ?? { label: delivery.status, cls: 'bg-gray-100 text-gray-700 border-gray-300' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${s.cls}`}>{s.label}</span>;
};

const formatTime = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};

const protocolNames = (d: ProtocolDelivery) => (d.protocols ?? []).map((p) => p.name).join(', ');

// ---------------------------------------------------------------------------
// Preview modal (rendered in a sandboxed iframe: no scripts, no same-origin access)
// ---------------------------------------------------------------------------
export const ProtocolPreviewModal: React.FC<{ orderId: string; onClose: () => void }> = ({ orderId, onClose }) => {
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    edge<PreviewResponse>({ action: 'preview', order_id: orderId })
      .then((res) => active && setData(res))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [orderId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Email preview">
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Eye className="w-5 h-5 text-teal-500" /> Email preview
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Close preview">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto space-y-3 text-sm text-gray-800">
          {error && <p className="text-red-600">{error}</p>}
          {!data && !error && <p className="text-gray-500">Loading preview...</p>}
          {data && (
            <>
              <div className="space-y-1">
                <p><span className="font-semibold">To:</span> {data.to || <span className="text-red-600">no email on order</span>}</p>
                <p><span className="font-semibold">Subject:</span> {data.subject}</p>
                <p><span className="font-semibold">Protocols:</span> {data.protocols.map((p) => `${p.name} (v${p.version})`).join(', ') || 'none'}</p>
              </div>
              {data.would_skip && (
                <p className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-3">
                  This email would be skipped: {data.would_skip}
                </p>
              )}
              {data.auto_enabled === false && (
                <p className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-3">
                  Automatic sending is turned off (protocol_config.enabled = false). Resend still works.
                </p>
              )}
              <iframe
                title="Protocol email preview"
                sandbox=""
                srcDoc={data.html}
                className="w-full h-[60vh] border border-gray-200 rounded-lg bg-white"
              />
              <p className="text-xs text-gray-500">
                Approximate layout. The final email uses the PostHog template; download links in the preview are live.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Per-order panel (used inside OrdersManager's order detail view)
// ---------------------------------------------------------------------------
export const OrderProtocolEmailPanel: React.FC<{ orderId: string; orderStatus: string }> = ({ orderId, orderStatus }) => {
  const [deliveries, setDeliveries] = useState<ProtocolDelivery[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await edge<ListResponse>({ action: 'list', order_id: orderId, limit: 10 });
      setDeliveries(res.deliveries);
    } catch (err) {
      setError(errorMessage(err));
      setDeliveries([]);
    }
  }, [orderId]);

  useEffect(() => {
    load();
    // The email is dispatched asynchronously after confirmation: check again shortly after.
    if (orderStatus !== 'confirmed') return;
    const t = setTimeout(load, 5000);
    return () => clearTimeout(t);
  }, [load, orderStatus]);

  const resend = async () => {
    if (!confirm('Send the protocol email for this order again, using the latest protocols?')) return;
    setBusy(true);
    try {
      await edge({ action: 'resend', order_id: orderId });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const latest = deliveries?.[0];
  return (
    <div className="bg-teal-50/60 rounded-lg md:rounded-xl p-4 border border-teal-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-gray-900 text-sm md:text-base flex items-center gap-2">
            <Mail className="w-4 h-4 md:w-5 md:h-5 text-teal-600" /> Protocol email
          </h3>
          <div className="mt-1 text-xs md:text-sm text-gray-700 space-y-1">
            {deliveries === null ? (
              <p className="text-gray-500">Loading...</p>
            ) : !latest ? (
              <p className="text-gray-500">
                {orderStatus === 'new' ? 'Sent automatically when the order is confirmed.' : 'No protocol email recorded for this order.'}
              </p>
            ) : (
              <>
                <p className="flex flex-wrap items-center gap-2">
                  <DeliveryStatusBadge delivery={latest} />
                  <span className="text-gray-500">{formatTime(latest.created_at)}</span>
                  <span className="text-gray-500">{latest.trigger_source === 'auto' ? 'Automatic' : 'Manual resend'}</span>
                  {deliveries.length > 1 && <span className="text-gray-500">({deliveries.length} sends)</span>}
                </p>
                {protocolNames(latest) && <p className="truncate">Protocols: {protocolNames(latest)}</p>}
                {latest.status_reason && <p className="text-red-600 break-words">{latest.status_reason}</p>}
              </>
            )}
            {error && <p className="text-red-600">{error}</p>}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={load}
            className="px-2 py-2 rounded-lg border border-teal-200 text-teal-700 bg-white hover:bg-teal-50"
            aria-label="Refresh protocol email status"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPreview(true)}
            className="flex-1 sm:flex-none px-3 py-2 rounded-lg border border-teal-200 text-teal-700 bg-white hover:bg-teal-50 text-xs md:text-sm font-medium flex items-center justify-center gap-1"
          >
            <Eye className="w-4 h-4" /> Preview
          </button>
          <button
            onClick={resend}
            disabled={busy}
            className="flex-1 sm:flex-none px-3 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-xs md:text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Send className="w-4 h-4" /> {busy ? 'Sending...' : 'Resend protocols'}
          </button>
        </div>
      </div>
      {preview && <ProtocolPreviewModal orderId={orderId} onClose={() => setPreview(false)} />}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
interface ProtocolDeliveriesManagerProps {
  onBack: () => void;
}

const ProtocolDeliveriesManager: React.FC<ProtocolDeliveriesManagerProps> = ({ onBack }) => {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [deliveries, setDeliveries] = useState<ProtocolDelivery[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null);
  const requestSeq = useRef(0);

  // Debounce the search box.
  useEffect(() => {
    // Same values on mount are no-ops (React bails out), so this only reloads when the text changes.
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await edge<ListResponse>({
        action: 'list',
        status: filter,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      if (seq !== requestSeq.current) return;
      setDeliveries(res.deliveries ?? []);
      setTotal(res.total ?? 0);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(errorMessage(err));
      setDeliveries([]);
      setTotal(0);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [filter, search, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const resend = async (d: ProtocolDelivery) => {
    if (!confirm(`Resend protocols for order ${d.order_number || d.order_id.slice(0, 8)} to ${d.customer_email || 'the customer'}?`)) return;
    setBusyId(d.id);
    setNotice(null);
    try {
      const res = await edge<{ delivery: ProtocolDelivery | null }>({ action: 'resend', order_id: d.order_id });
      const st = res.delivery?.status;
      setNotice(
        st === 'handed_off'
          ? 'Resend handed to PostHog.'
          : `Resend finished with status "${st ?? 'unknown'}"${res.delivery?.status_reason ? `: ${res.delivery.status_reason}` : ''}.`,
      );
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const actions = (d: ProtocolDelivery) => (
    <div className="flex gap-2">
      <button
        onClick={() => setPreviewOrderId(d.order_id)}
        className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-medium flex items-center gap-1"
        aria-label={`Preview order ${d.order_number ?? d.order_id}`}
      >
        <Eye className="w-4 h-4" /> Preview
      </button>
      <button
        onClick={() => resend(d)}
        disabled={busyId === d.id}
        className="px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-xs font-medium flex items-center gap-1 disabled:opacity-50"
        aria-label={`Resend order ${d.order_number ?? d.order_id}`}
      >
        <Send className="w-4 h-4" /> {busyId === d.id ? 'Sending...' : 'Resend'}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          <div className="flex items-center justify-between h-14 gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={onBack} className="text-gray-700 hover:text-teal-600 transition-colors flex items-center gap-1 group">
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 group-hover:-translate-x-1 transition-transform" />
                <span className="text-xs sm:text-sm">Dashboard</span>
              </button>
              <h1 className="text-base sm:text-xl font-bold text-gray-800 flex items-center gap-2 truncate">
                <Mail className="w-5 h-5 sm:w-6 sm:h-6 text-teal-500" /> Protocol Emails
              </h1>
            </div>
            <button
              onClick={load}
              className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Status filter">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={filter === f.key}
                  onClick={() => {
                    setFilter(f.key);
                    setOffset(0);
                  }}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    filter === f.key ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by order number or email..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent text-black"
              />
            </div>
          </div>

          {notice && <div className="px-4 py-3 bg-teal-50 text-teal-800 text-sm border-b border-teal-100">{notice}</div>}
          {error && <div className="px-4 py-3 bg-red-50 text-red-700 text-sm border-b border-red-100">{error}</div>}

          {loading && deliveries.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : deliveries.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No protocol emails found.</div>
          ) : (
            <>
              {/* Mobile: cards */}
              <div className="md:hidden p-4 space-y-3">
                {deliveries.map((d) => (
                  <div key={d.id} className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2" data-testid="delivery-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-teal-600">{d.order_number || d.order_id.slice(0, 8)}</p>
                        <p className="text-sm text-gray-800 truncate">{d.customer_name}</p>
                        <p className="text-xs text-gray-500 truncate">{d.customer_email || 'no email'}</p>
                      </div>
                      <DeliveryStatusBadge delivery={d} />
                    </div>
                    {protocolNames(d) && <p className="text-sm text-gray-700">{protocolNames(d)}</p>}
                    {d.status_reason && <p className="text-xs text-red-600 break-words">{d.status_reason}</p>}
                    <p className="text-xs text-gray-500">
                      {formatTime(d.created_at)} · {d.trigger_source === 'auto' ? 'Auto' : 'Manual'} · {d.attempts} attempt{d.attempts === 1 ? '' : 's'}
                    </p>
                    {actions(d)}
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Order</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Protocols sent</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-center">Attempts</th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {deliveries.map((d) => (
                      <tr key={d.id} className="align-top hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-teal-600">{d.order_number || d.order_id.slice(0, 8)}</p>
                          <p className="text-xs text-gray-500">{d.trigger_source === 'auto' ? 'Auto' : 'Manual'}</p>
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <p className="text-gray-800 truncate">{d.customer_name}</p>
                          <p className="text-xs text-gray-500 truncate">{d.customer_email || 'no email'}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-[260px]">{protocolNames(d) || <span className="text-gray-400">none</span>}</td>
                        <td className="px-4 py-3 max-w-[240px]">
                          <DeliveryStatusBadge delivery={d} />
                          {d.status_reason && <p className="mt-1 text-xs text-red-600 break-words">{d.status_reason}</p>}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700">{d.attempts}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatTime(d.created_at)}</td>
                        <td className="px-4 py-3">{actions(d)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {total > PAGE_SIZE && (
                <div className="flex items-center justify-between p-4 border-t border-gray-100 text-sm text-gray-600">
                  <span>
                    {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of {total}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      disabled={offset + PAGE_SIZE >= total}
                      onClick={() => setOffset(offset + PAGE_SIZE)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {previewOrderId && <ProtocolPreviewModal orderId={previewOrderId} onClose={() => setPreviewOrderId(null)} />}
    </div>
  );
};

export default ProtocolDeliveriesManager;
