import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminDashboard from './AdminDashboard';
import { EdgeError } from '../lib/edgeApi';

const mockCallEdge = vi.fn();
vi.mock('../lib/edgeApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/edgeApi')>();
  return { ...actual, callEdge: (...args: unknown[]) => mockCallEdge(...args) };
});

vi.mock('../hooks/useMenu', () => ({
  useMenu: () => ({
    products: [],
    loading: false,
    addProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
    refreshProducts: vi.fn(),
  }),
}));
vi.mock('../hooks/useCategories', () => ({ useCategories: () => ({ categories: [] }) }));
vi.mock('../hooks/useProtocols', () => ({
  useProtocols: () => ({ addProtocol: vi.fn(), setAssignments: vi.fn() }),
}));

const ADMIN_TOKEN_KEY = 'pa_admin_session';

describe('AdminDashboard server-side auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('logs in through admin-auth and stores the token', async () => {
    mockCallEdge.mockResolvedValueOnce({ token: 'tok-1', must_rotate: false });
    render(<AdminDashboard />);

    await userEvent.type(screen.getByPlaceholderText('Enter admin password'), 'secret-pass');
    await userEvent.click(screen.getByText('Access Dashboard'));

    await waitFor(() =>
      expect(mockCallEdge).toHaveBeenCalledWith('admin-auth', { action: 'login', password: 'secret-pass' }),
    );
    await waitFor(() => expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBe('tok-1'));
    expect(screen.queryByText('Access Dashboard')).not.toBeInTheDocument();
  });

  it('shows an error on a wrong password', async () => {
    mockCallEdge.mockRejectedValueOnce(new EdgeError('Invalid password', 401));
    render(<AdminDashboard />);

    await userEvent.type(screen.getByPlaceholderText('Enter admin password'), 'nope');
    await userEvent.click(screen.getByText('Access Dashboard'));

    expect(await screen.findByText(/Invalid password/)).toBeInTheDocument();
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull();
  });

  it('blocks the dashboard with a change-password form when must_rotate is true', async () => {
    mockCallEdge
      .mockResolvedValueOnce({ token: 'tok-old', must_rotate: true })
      .mockResolvedValueOnce({ token: 'tok-new', must_rotate: false });
    render(<AdminDashboard />);

    await userEvent.type(screen.getByPlaceholderText('Enter admin password'), 'old-public-pass');
    await userEvent.click(screen.getByText('Access Dashboard'));

    expect(await screen.findByRole('heading', { name: 'Change admin password' })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Current password'), 'old-public-pass');
    await userEvent.type(screen.getByLabelText('New password'), 'brand-new-pass');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'brand-new-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() =>
      expect(mockCallEdge).toHaveBeenCalledWith(
        'admin-auth',
        { action: 'change_password', current: 'old-public-pass', next: 'brand-new-pass' },
        { token: 'tok-old' },
      ),
    );
    await waitFor(() => expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBe('tok-new'));
    expect(screen.queryByRole('heading', { name: 'Change admin password' })).not.toBeInTheDocument();
  });

  it('validates the new admin password locally', async () => {
    mockCallEdge.mockResolvedValueOnce({ token: 'tok-old', must_rotate: true });
    render(<AdminDashboard />);
    await userEvent.type(screen.getByPlaceholderText('Enter admin password'), 'old-public-pass');
    await userEvent.click(screen.getByText('Access Dashboard'));
    await screen.findByRole('heading', { name: 'Change admin password' });

    await userEvent.type(screen.getByLabelText('Current password'), 'old-public-pass');
    await userEvent.type(screen.getByLabelText('New password'), 'brand-new-pass');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'different-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(screen.getByRole('alert')).toHaveTextContent('do not match');
    expect(mockCallEdge).toHaveBeenCalledTimes(1);
  });

  it('verifies a stored token on mount and drops to login when invalid', async () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, 'stale');
    mockCallEdge.mockResolvedValueOnce({ valid: false, must_rotate: false });
    render(<AdminDashboard />);

    expect(await screen.findByText('Access Dashboard')).toBeInTheDocument();
    expect(mockCallEdge).toHaveBeenCalledWith('admin-auth', { action: 'verify' }, { token: 'stale' });
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull();
  });

  it('ignores the legacy client-side auth flag', () => {
    localStorage.setItem('peptide_admin_auth', 'true');
    render(<AdminDashboard />);
    expect(screen.getByText('Access Dashboard')).toBeInTheDocument();
  });
});
