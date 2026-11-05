import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProtocolDeliveriesManager, { OrderProtocolEmailPanel } from './ProtocolDeliveriesManager';

const mockCallEdge = vi.fn();

vi.mock('../lib/edgeApi', () => {
  class EdgeError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return { callEdge: (...args: unknown[]) => mockCallEdge(...args), EdgeError };
});

vi.mock('../lib/adminSession', () => ({ getAdminToken: () => 'admin-token' }));

const baseDelivery = {
  id: 'd1',
  order_id: '11111111-1111-1111-1111-111111111111',
  order_number: 'PA-1001',
  customer_email: 'ann@example.com',
  customer_name: 'Ann',
  trigger_source: 'auto',
  status: 'delivered',
  status_reason: null,
  protocols: [{ protocol_id: 'p1', name: 'Tirzepatide', version: 2 }],
  attempts: 1,
  handed_off_at: '2026-11-01T10:00:00Z',
  sent_at: null,
  delivered_at: null,
  failed_at: null,
  created_at: '2026-11-01T10:00:00Z',
  unconfirmed: false,
};

const deliveries = [
  baseDelivery,
  { ...baseDelivery, id: 'd2', order_number: 'PA-1002', status: 'failed', status_reason: 'PostHog capture HTTP 500' },
  { ...baseDelivery, id: 'd3', order_number: 'PA-1003', status: 'handed_off', unconfirmed: true },
];

function mockList(rows = deliveries) {
  mockCallEdge.mockImplementation((_fn: string, body: Record<string, unknown>) => {
    if (body.action === 'list') return Promise.resolve({ ok: true, deliveries: rows, total: rows.length });
    if (body.action === 'resend') return Promise.resolve({ ok: true, delivery: { ...baseDelivery, status: 'handed_off' } });
    if (body.action === 'preview') {
      return Promise.resolve({
        ok: true,
        to: 'ann@example.com',
        subject: 'Your protocol for order PA-1001',
        html: '<p>preview body</p>',
        text: 'preview',
        protocols: [{ protocol_id: 'p1', name: 'Tirzepatide', version: 2 }],
        would_skip: null,
      });
    }
    return Promise.reject(new Error('unexpected'));
  });
}

describe('ProtocolDeliveriesManager', () => {
  beforeEach(() => {
    mockCallEdge.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('lists deliveries with the admin token and shows status badges', async () => {
    mockList();
    render(<ProtocolDeliveriesManager onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getAllByText('PA-1001').length).toBeGreaterThan(0));
    expect(mockCallEdge).toHaveBeenCalledWith(
      'protocol-delivery',
      expect.objectContaining({ action: 'list', status: 'all' }),
      { token: 'admin-token' },
    );
    expect(screen.getAllByText('Delivered').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unconfirmed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PostHog capture HTTP 500').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tirzepatide').length).toBeGreaterThan(0);
  });

  it('filters by status', async () => {
    mockList();
    const user = userEvent.setup();
    render(<ProtocolDeliveriesManager onBack={vi.fn()} />);
    await waitFor(() => expect(mockCallEdge).toHaveBeenCalled());

    await user.click(screen.getByRole('tab', { name: 'Failed' }));
    await waitFor(() =>
      expect(mockCallEdge).toHaveBeenLastCalledWith(
        'protocol-delivery',
        expect.objectContaining({ action: 'list', status: 'failed' }),
        { token: 'admin-token' },
      ),
    );
  });

  it('searches by order number or email', async () => {
    mockList();
    const user = userEvent.setup();
    render(<ProtocolDeliveriesManager onBack={vi.fn()} />);
    await waitFor(() => expect(mockCallEdge).toHaveBeenCalled());

    await user.type(screen.getByPlaceholderText(/search by order number or email/i), 'PA-1002');
    await waitFor(
      () =>
        expect(mockCallEdge).toHaveBeenLastCalledWith(
          'protocol-delivery',
          expect.objectContaining({ action: 'list', search: 'PA-1002' }),
          { token: 'admin-token' },
        ),
      { timeout: 2000 },
    );
  });

  it('resends a delivery for its order', async () => {
    mockList([baseDelivery]);
    const user = userEvent.setup();
    render(<ProtocolDeliveriesManager onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText('PA-1001').length).toBeGreaterThan(0));

    await user.click(screen.getAllByRole('button', { name: /resend order PA-1001/i })[0]);
    await waitFor(() =>
      expect(mockCallEdge).toHaveBeenCalledWith(
        'protocol-delivery',
        { action: 'resend', order_id: baseDelivery.order_id },
        { token: 'admin-token' },
      ),
    );
    expect(await screen.findByText('Resend handed to PostHog.')).toBeInTheDocument();
  });

  it('does not resend when the admin cancels the confirm', async () => {
    mockList([baseDelivery]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<ProtocolDeliveriesManager onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText('PA-1001').length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole('button', { name: /resend order PA-1001/i })[0]);
    expect(mockCallEdge).not.toHaveBeenCalledWith('protocol-delivery', expect.objectContaining({ action: 'resend' }), expect.anything());
  });

  it('opens a preview in a sandboxed iframe', async () => {
    mockList([baseDelivery]);
    const user = userEvent.setup();
    render(<ProtocolDeliveriesManager onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText('PA-1001').length).toBeGreaterThan(0));

    await user.click(screen.getAllByRole('button', { name: /preview order PA-1001/i })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Your protocol for order PA-1001')).toBeInTheDocument();
    const frame = within(dialog).getByTitle('Protocol email preview');
    expect(frame).toHaveAttribute('sandbox', '');
    expect(frame.getAttribute('srcdoc')).toContain('preview body');
  });

  it('shows a session message on 401', async () => {
    const { EdgeError } = await import('../lib/edgeApi');
    mockCallEdge.mockRejectedValue(new EdgeError('unauthorized', 401));
    render(<ProtocolDeliveriesManager onBack={vi.fn()} />);
    expect(await screen.findByText(/session has expired/i)).toBeInTheDocument();
  });

  it('shows the server message when the admin password must be rotated (403)', async () => {
    const { EdgeError } = await import('../lib/edgeApi');
    mockCallEdge.mockRejectedValue(new EdgeError('Change the admin password first', 403));
    render(<ProtocolDeliveriesManager onBack={vi.fn()} />);
    expect(await screen.findByText('Change the admin password first')).toBeInTheDocument();
  });

  it('calls onBack', async () => {
    mockList([]);
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<ProtocolDeliveriesManager onBack={onBack} />);
    expect(await screen.findByText('No protocol emails found.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /dashboard/i }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('OrderProtocolEmailPanel', () => {
  beforeEach(() => {
    mockCallEdge.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('loads status for the order and resends', async () => {
    mockList([baseDelivery]);
    const user = userEvent.setup();
    render(<OrderProtocolEmailPanel orderId={baseDelivery.order_id} orderStatus="confirmed" />);

    expect(await screen.findByText('Delivered')).toBeInTheDocument();
    expect(mockCallEdge).toHaveBeenCalledWith(
      'protocol-delivery',
      expect.objectContaining({ action: 'list', order_id: baseDelivery.order_id }),
      { token: 'admin-token' },
    );

    await user.click(screen.getByRole('button', { name: /resend protocols/i }));
    await waitFor(() =>
      expect(mockCallEdge).toHaveBeenCalledWith(
        'protocol-delivery',
        { action: 'resend', order_id: baseDelivery.order_id },
        { token: 'admin-token' },
      ),
    );
  });

  it('explains auto-send for new orders with no delivery yet', async () => {
    mockList([]);
    render(<OrderProtocolEmailPanel orderId={baseDelivery.order_id} orderStatus="new" />);
    expect(await screen.findByText(/sent automatically when the order is confirmed/i)).toBeInTheDocument();
  });
});
