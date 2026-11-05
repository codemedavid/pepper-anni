import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProtocols } from './useProtocols';
import { allMockProtocols, mockTextProtocol } from '../test/mocks';
import { EdgeError } from '../lib/edgeApi';

// All admin protocol access goes through the protocol-admin edge function.
const mockCallEdge = vi.fn();
vi.mock('../lib/edgeApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/edgeApi')>();
  return { ...actual, callEdge: (...args: unknown[]) => mockCallEdge(...args) };
});

vi.mock('../lib/adminSession', () => ({
  getAdminToken: () => 'admin-token',
}));

// The supabase client must not be used for protocols any more.
const mockFrom = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

type Body = { action: string; [k: string]: unknown };

function defaultEdge(_fn: string, body: Body) {
  switch (body.action) {
    case 'list':
      return Promise.resolve({ protocols: allMockProtocols });
    case 'create':
    case 'update':
    case 'toggle_active':
      return Promise.resolve({ protocol: { ...mockTextProtocol, id: 'new-id' } });
    case 'delete':
      return Promise.resolve({ success: true });
    case 'set_assignments':
      return Promise.resolve({ product_ids: body.product_ids });
    default:
      return Promise.reject(new EdgeError('Unknown action', 400));
  }
}

const callsFor = (action: string) =>
  mockCallEdge.mock.calls.filter(([, body]) => (body as Body).action === action);

describe('useProtocols', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCallEdge.mockImplementation(defaultEdge);
  });

  describe('fetchProtocols', () => {
    it('lists protocols through protocol-admin with the admin token', async () => {
      const { result } = renderHook(() => useProtocols());
      expect(result.current.loading).toBe(true);

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(mockCallEdge).toHaveBeenCalledWith('protocol-admin', { action: 'list' }, { token: 'admin-token' });
      expect(result.current.protocols).toEqual(allMockProtocols);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('sets error on fetch failure', async () => {
      mockCallEdge.mockRejectedValueOnce(new EdgeError('DB error', 500));
      const { result } = renderHook(() => useProtocols());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe('DB error');
      expect(result.current.protocols).toEqual([]);
    });

    it('reports an expired admin session on 401', async () => {
      mockCallEdge.mockRejectedValueOnce(new EdgeError('Admin session expired', 401));
      const { result } = renderHook(() => useProtocols());

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toMatch(/session expired/i);
    });

    it('does not fetch when autoFetch is false', async () => {
      const { result } = renderHook(() => useProtocols({ autoFetch: false }));
      expect(result.current.loading).toBe(false);
      await result.current.addProtocol({ name: 'X', category: 'Y' });
      expect(callsFor('list')).toHaveLength(0);
      expect(callsFor('create')).toHaveLength(1);
    });

    it('returns protocols with all content types', async () => {
      const { result } = renderHook(() => useProtocols());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.protocols.filter(p => p.content_type === 'text')).toHaveLength(2);
      expect(result.current.protocols.filter(p => p.content_type === 'image')).toHaveLength(1);
      expect(result.current.protocols.filter(p => p.content_type === 'file')).toHaveLength(1);
    });
  });

  describe('addProtocol', () => {
    const base = {
      name: 'New Protocol', category: 'Test', dosage: '10mg', frequency: 'Daily', duration: '4 weeks',
      notes: ['Note 1'], storage: 'Room temp', sort_order: 5, active: true,
      content_type: 'text' as const, file_url: null,
    };

    it('creates a text protocol and refreshes the list', async () => {
      const { result } = renderHook(() => useProtocols());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const res = await result.current.addProtocol(base);

      expect(res.success).toBe(true);
      expect(res.data?.id).toBe('new-id');
      expect(callsFor('create')[0][1]).toEqual({ action: 'create', protocol: base });
      expect(callsFor('list').length).toBeGreaterThanOrEqual(2);
    });

    it('creates a file protocol with a private file_path', async () => {
      const { result } = renderHook(() => useProtocols());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await result.current.addProtocol({ ...base, content_type: 'file', file_path: '123-abc.pdf' });

      expect((callsFor('create')[0][1] as Body).protocol).toEqual(
        expect.objectContaining({ content_type: 'file', file_path: '123-abc.pdf' }),
      );
    });

    it('strips read-only fields before sending', async () => {
      const { result } = renderHook(() => useProtocols());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await result.current.updateProtocol('proto-1', {
        ...mockTextProtocol,
        version: 3,
        product_ids: ['p1'],
        signed_url: 'https://signed',
      });

      const updates = (callsFor('update')[0][1] as Body).updates as Record<string, unknown>;
      expect(updates).not.toHaveProperty('id');
      expect(updates).not.toHaveProperty('version');
      expect(updates).not.toHaveProperty('product_ids');
      expect(updates).not.toHaveProperty('signed_url');
      expect(updates).not.toHaveProperty('created_at');
      expect(updates.name).toBe('Tirzepatide');
    });

    it('returns error on add failure', async () => {
      const { result } = renderHook(() => useProtocols());
      await waitFor(() => expect(result.current.loading).toBe(false));
      mockCallEdge.mockRejectedValueOnce(new EdgeError('Insert failed', 500));

      const res = await result.current.addProtocol({ ...base, name: 'Fail' });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Insert failed');
    });
  });

  describe('updateProtocol', () => {
    it('updates content_type and file fields', async () => {
      const { result } = renderHook(() => useProtocols());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await result.current.updateProtocol('proto-1', { content_type: 'image', file_path: 'new.png', file_url: null });

      expect(callsFor('update')[0][1]).toEqual({
        action: 'update',
        id: 'proto-1',
        updates: { content_type: 'image', file_path: 'new.png', file_url: null },
      });
    });
  });

  describe('deleteProtocol', () => {
    it('deletes a protocol', async () => {
      const { result } = renderHook(() => useProtocols());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const res = await result.current.deleteProtocol('proto-1');

      expect(res.success).toBe(true);
      expect(callsFor('delete')[0][1]).toEqual({ action: 'delete', id: 'proto-1' });
    });
  });

  describe('toggleActive', () => {
    it('toggles protocol active state', async () => {
      const { result } = renderHook(() => useProtocols());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await result.current.toggleActive('proto-1', false);

      expect(callsFor('toggle_active')[0][1]).toEqual({ action: 'toggle_active', id: 'proto-1', active: false });
    });
  });

  describe('setAssignments', () => {
    it('replaces the product assignment set', async () => {
      const { result } = renderHook(() => useProtocols());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const res = await result.current.setAssignments('proto-1', ['prod-a', 'prod-b']);

      expect(res.success).toBe(true);
      expect(res.data).toEqual(['prod-a', 'prod-b']);
      expect(callsFor('set_assignments')[0][1]).toEqual({
        action: 'set_assignments', protocol_id: 'proto-1', product_ids: ['prod-a', 'prod-b'],
      });
    });
  });

  describe('Protocol interface', () => {
    it('text protocol has required text fields', () => {
      const proto = allMockProtocols.find(p => p.content_type === 'text' && p.active);
      expect(proto).toBeDefined();
      expect(proto!.dosage).toBeTruthy();
      expect(proto!.file_url).toBeNull();
    });

    it('image and file protocols carry a file reference', () => {
      expect(allMockProtocols.find(p => p.content_type === 'image')!.file_url).toContain('protocol-files');
      expect(allMockProtocols.find(p => p.content_type === 'file')!.file_url).toContain('.pdf');
    });
  });
});
