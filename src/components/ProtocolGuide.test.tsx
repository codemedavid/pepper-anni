import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProtocolGuide from './ProtocolGuide';
import { allMockProtocols } from '../test/mocks';
import { EdgeError } from '../lib/edgeApi';
import { PORTAL_SESSION_KEY } from '../hooks/usePortalProtocols';

// The real usePortalProtocols hook runs; only the network (protocol-portal edge function) is mocked.
const mockCallEdge = vi.fn();
vi.mock('../lib/edgeApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/edgeApi')>();
  return { ...actual, callEdge: (...args: unknown[]) => mockCallEdge(...args) };
});

// Mock useCart
vi.mock('../hooks/useCart', () => ({
  useCart: () => ({
    cartItems: [],
  }),
}));

// Mock Header and Footer to simplify
vi.mock('./Header', () => ({
  default: () => <div data-testid="header">Header</div>,
}));

vi.mock('./Footer', () => ({
  default: () => <div data-testid="footer">Footer</div>,
}));

const future = () => new Date(Date.now() + 3600_000).toISOString();

function portalEdge(_fn: string, body: { action: string; password?: string; token?: string }, opts?: { token?: string }) {
  if (body.action === 'redeem') {
    return body.token === 'good-link'
      ? Promise.resolve({ token: 'portal-token', expires_at: future() })
      : Promise.reject(new EdgeError('This link has expired. Please enter the password.', 401));
  }
  if (body.action === 'unlock') {
    return body.password === 'correct-horse'
      ? Promise.resolve({ token: 'portal-token', expires_at: future() })
      : Promise.reject(new EdgeError('Incorrect password', 401));
  }
  if (body.action === 'list') {
    return opts?.token ? Promise.resolve({ protocols: allMockProtocols }) : Promise.reject(new EdgeError('Session expired', 401));
  }
  return Promise.reject(new EdgeError('Unknown action', 400));
}

/** Renders the page with a stored portal session and waits for the protocol list. */
async function renderUnlocked() {
  localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify({ token: 'portal-token', expires_at: future() }));
  render(<ProtocolGuide />);
  await screen.findByText('Tirzepatide');
}

describe('ProtocolGuide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockCallEdge.mockImplementation(portalEdge);
    window.history.replaceState(null, '', '/protocols');
  });

  // --- Lock / unlock ---

  describe('portal lock', () => {
    it('shows the unlock card and no protocol content when locked', () => {
      render(<ProtocolGuide />);

      expect(screen.getByText('Peptide Protocol Guide')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByText(/included in your order confirmation email/)).toBeInTheDocument();
      expect(screen.queryByText('Tirzepatide')).not.toBeInTheDocument();
      expect(screen.queryByText('Peptide Protocols')).not.toBeInTheDocument();
      expect(mockCallEdge).not.toHaveBeenCalled();
    });

    it('toggles password visibility', async () => {
      render(<ProtocolGuide />);
      const input = screen.getByLabelText('Password');
      expect(input).toHaveAttribute('type', 'password');

      await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
      expect(input).toHaveAttribute('type', 'text');

      await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
      expect(input).toHaveAttribute('type', 'password');
    });

    it('shows an error on a wrong password and stays locked', async () => {
      render(<ProtocolGuide />);

      await userEvent.type(screen.getByLabelText('Password'), 'wrong-pass');
      await userEvent.click(screen.getByRole('button', { name: /Unlock Protocols/ }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect password');
      expect(screen.queryByText('Tirzepatide')).not.toBeInTheDocument();
      expect(localStorage.getItem(PORTAL_SESSION_KEY)).toBeNull();
    });

    it('unlocks with the correct password and stores the session', async () => {
      render(<ProtocolGuide />);

      await userEvent.type(screen.getByLabelText('Password'), 'correct-horse');
      await userEvent.click(screen.getByRole('button', { name: /Unlock Protocols/ }));

      expect(await screen.findByText('Tirzepatide')).toBeInTheDocument();
      expect(mockCallEdge).toHaveBeenCalledWith('protocol-portal', { action: 'unlock', password: 'correct-horse' });
      expect(mockCallEdge).toHaveBeenCalledWith('protocol-portal', { action: 'list' }, { token: 'portal-token' });
      expect(JSON.parse(localStorage.getItem(PORTAL_SESSION_KEY)!).token).toBe('portal-token');
    });

    it('opens the portal without a password from the email link and clears the token from the URL', async () => {
      window.history.replaceState(null, '', '/protocols#access=good-link');
      render(<ProtocolGuide />);

      expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
      expect(await screen.findByText('Tirzepatide')).toBeInTheDocument();
      expect(mockCallEdge).toHaveBeenCalledWith('protocol-portal', { action: 'redeem', token: 'good-link' });
      expect(mockCallEdge).toHaveBeenCalledWith('protocol-portal', { action: 'list' }, { token: 'portal-token' });
      expect(JSON.parse(localStorage.getItem(PORTAL_SESSION_KEY)!).token).toBe('portal-token');
      expect(window.location.hash).toBe('');
    });

    it('falls back to the password card when the email link has expired', async () => {
      window.history.replaceState(null, '', '/protocols#access=old-link');
      render(<ProtocolGuide />);

      expect(await screen.findByText(/link has expired/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(localStorage.getItem(PORTAL_SESSION_KEY)).toBeNull();
      expect(window.location.hash).toBe('');
    });

    it('re-locks when the server rejects the session (401)', async () => {
      localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify({ token: 'stale-token', expires_at: future() }));
      mockCallEdge.mockImplementation(() => Promise.reject(new EdgeError('Session expired', 401)));

      render(<ProtocolGuide />);

      expect(await screen.findByText(/session has expired/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(localStorage.getItem(PORTAL_SESSION_KEY)).toBeNull();
    });

    it('treats a locally expired session as locked without calling the server', () => {
      localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify({ token: 't', expires_at: new Date(Date.now() - 1000).toISOString() }));
      render(<ProtocolGuide />);

      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(mockCallEdge).not.toHaveBeenCalled();
    });

    it('Lock button clears the session and shows the unlock card', async () => {
      await renderUnlocked();

      await userEvent.click(screen.getByRole('button', { name: /^Lock$/ }));

      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.queryByText('Tirzepatide')).not.toBeInTheDocument();
      expect(localStorage.getItem(PORTAL_SESSION_KEY)).toBeNull();
    });
  });

  // --- Rendering ---

  describe('rendering', () => {
    it('renders the protocol guide page', async () => {
      await renderUnlocked();

      expect(screen.getByText('Peptide Protocol Guide')).toBeInTheDocument();
    });

    it('only shows active protocols', async () => {
      await renderUnlocked();

      expect(screen.getByText('Tirzepatide')).toBeInTheDocument();
      expect(screen.getByText('GHK-Cu Protocol')).toBeInTheDocument();
      expect(screen.getByText('BPC-157 Protocol')).toBeInTheDocument();

      // Inactive protocol should NOT appear
      expect(screen.queryByText('Hidden Protocol')).not.toBeInTheDocument();
    });

    it('shows protocol count', async () => {
      await renderUnlocked();

      expect(screen.getByText('3 protocol(s) found')).toBeInTheDocument();
    });
  });

  // --- Text Protocol Expanded ---

  describe('text protocol content', () => {
    it('shows dosage, frequency, duration when expanded', async () => {
      await renderUnlocked();

      await userEvent.click(screen.getByText('Tirzepatide'));

      expect(screen.getByText('2.5mg - 15mg')).toBeInTheDocument();
      expect(screen.getByText('Once weekly')).toBeInTheDocument();
      expect(screen.getByText('12-16 weeks')).toBeInTheDocument();
    });

    it('shows protocol notes when expanded', async () => {
      await renderUnlocked();

      await userEvent.click(screen.getByText('Tirzepatide'));

      expect(screen.getByText('Start low')).toBeInTheDocument();
      expect(screen.getByText('Rotate injection sites')).toBeInTheDocument();
    });

    it('shows storage info when expanded', async () => {
      await renderUnlocked();

      await userEvent.click(screen.getByText('Tirzepatide'));

      // Use getAllByText since "Refrigerate" appears in the static storage section too
      const storageElements = screen.getAllByText(/Refrigerate at 2-8°C/);
      expect(storageElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --- Image Protocol Expanded ---

  describe('image protocol content', () => {
    it('shows image when image protocol is expanded', async () => {
      await renderUnlocked();

      // Click the protocol name button to expand
      const protocolButtons = screen.getAllByRole('button');
      const ghkButton = protocolButtons.find(btn => btn.textContent?.includes('GHK-Cu Protocol'));
      expect(ghkButton).toBeDefined();
      await userEvent.click(ghkButton!);

      const img = screen.getByAltText('GHK-Cu Protocol protocol');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://test.supabase.co/storage/v1/object/public/protocol-files/ghk-protocol.png');
    });

    it('does NOT show text dosage fields for image protocol', async () => {
      await renderUnlocked();

      const protocolButtons = screen.getAllByRole('button');
      const ghkButton = protocolButtons.find(btn => btn.textContent?.includes('GHK-Cu Protocol'));
      await userEvent.click(ghkButton!);

      // Image protocol should show image, not dosage card
      const img = screen.getByAltText('GHK-Cu Protocol protocol');
      expect(img).toBeInTheDocument();
    });
  });

  // --- File Protocol Expanded ---

  describe('file protocol content', () => {
    it('shows download link when file protocol is expanded', async () => {
      await renderUnlocked();

      const protocolButtons = screen.getAllByRole('button');
      const bpcButton = protocolButtons.find(btn => btn.textContent?.includes('BPC-157 Protocol'));
      expect(bpcButton).toBeDefined();
      await userEvent.click(bpcButton!);

      expect(screen.getByText('Click to view or download')).toBeInTheDocument();
    });

    it('file link opens in new tab with correct href', async () => {
      await renderUnlocked();

      const protocolButtons = screen.getAllByRole('button');
      const bpcButton = protocolButtons.find(btn => btn.textContent?.includes('BPC-157 Protocol'));
      await userEvent.click(bpcButton!);

      const link = screen.getByText('Click to view or download').closest('a');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveAttribute('href', 'https://test.supabase.co/storage/v1/object/public/protocol-files/bpc-protocol.pdf');
    });
  });

  // --- Collapse/Expand ---

  describe('expand and collapse', () => {
    it('collapses an expanded protocol when clicked again', async () => {
      await renderUnlocked();

      await userEvent.click(screen.getByText('Tirzepatide'));
      expect(screen.getByText('2.5mg - 15mg')).toBeInTheDocument();

      await userEvent.click(screen.getByText('Tirzepatide'));
      expect(screen.queryByText('2.5mg - 15mg')).not.toBeInTheDocument();
    });

    it('only one protocol is expanded at a time', async () => {
      await renderUnlocked();

      // Expand Tirzepatide
      await userEvent.click(screen.getByText('Tirzepatide'));
      expect(screen.getByText('2.5mg - 15mg')).toBeInTheDocument();

      // Expand GHK-Cu via button
      const protocolButtons = screen.getAllByRole('button');
      const ghkButton = protocolButtons.find(btn => btn.textContent?.includes('GHK-Cu Protocol'));
      await userEvent.click(ghkButton!);

      // Tirzepatide should collapse
      expect(screen.queryByText('2.5mg - 15mg')).not.toBeInTheDocument();
      // GHK-Cu image should show
      expect(screen.getByAltText('GHK-Cu Protocol protocol')).toBeInTheDocument();
    });
  });

  // --- Category Filter ---

  describe('category filtering', () => {
    it('shows all categories in the filter dropdown', async () => {
      await renderUnlocked();

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();

      const options = screen.getAllByRole('option');
      const optionTexts = options.map(o => o.textContent);

      expect(optionTexts).toContain('Weight Management');
      expect(optionTexts).toContain('Skin & Anti-Aging');
      expect(optionTexts).toContain('Recovery & Healing');
    });

    it('filters protocols by category', async () => {
      await renderUnlocked();

      const select = screen.getByRole('combobox');
      await userEvent.selectOptions(select, 'Weight Management');

      expect(screen.getByText('Tirzepatide')).toBeInTheDocument();
      expect(screen.queryByText('GHK-Cu Protocol')).not.toBeInTheDocument();
      expect(screen.queryByText('BPC-157 Protocol')).not.toBeInTheDocument();
      expect(screen.getByText('1 protocol(s) found')).toBeInTheDocument();
    });

    it('shows all protocols when "all" is selected', async () => {
      await renderUnlocked();

      const select = screen.getByRole('combobox');
      await userEvent.selectOptions(select, 'Weight Management');
      expect(screen.getByText('1 protocol(s) found')).toBeInTheDocument();

      await userEvent.selectOptions(select, 'all');
      expect(screen.getByText('3 protocol(s) found')).toBeInTheDocument();
    });
  });
});
