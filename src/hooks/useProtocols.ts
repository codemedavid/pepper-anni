import { useState, useEffect, useCallback } from 'react';
import { callEdge, EdgeError } from '../lib/edgeApi';
import { getAdminToken } from '../lib/adminSession';

export interface Protocol {
    id: string;
    name: string;
    category: string;
    dosage: string;
    frequency: string;
    duration: string;
    notes: string[];
    storage: string;
    sort_order: number;
    active: boolean;
    content_type: 'text' | 'file' | 'image';
    /** Public/legacy URL, or (portal) a short-lived signed URL. */
    file_url: string | null;
    /** Object path inside the private `protocol-files` bucket. */
    file_path?: string | null;
    /** Short-lived signed URL for admin preview (protocol-admin `list`). */
    signed_url?: string | null;
    product_id?: string | null;
    /** Products this protocol is assigned to (product_protocols). */
    product_ids?: string[];
    /** Auto-bumped whenever the content changes. */
    version?: number;
    created_at: string;
    updated_at: string;
}

/** Fields an admin can write. name + category are required on create. */
export type ProtocolInput = Partial<
    Pick<Protocol, 'dosage' | 'frequency' | 'duration' | 'notes' | 'storage' | 'sort_order' | 'active' |
        'content_type' | 'file_url' | 'file_path' | 'product_id'>
> & { name: string; category: string };

type Result<T = unknown> = { success: boolean; data?: T; error?: string };

const WRITABLE: (keyof Protocol)[] = [
    'name', 'category', 'dosage', 'frequency', 'duration', 'notes', 'storage', 'sort_order', 'active',
    'content_type', 'file_url', 'file_path', 'product_id',
];

function pickWritable(input: Partial<Protocol>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of WRITABLE) if (k in input && input[k] !== undefined) out[k] = input[k];
    return out;
}

function messageOf(err: unknown, fallback: string): string {
    if (err instanceof EdgeError && err.status === 401) return 'Admin session expired. Please log in again.';
    return err instanceof Error ? err.message : fallback;
}

/** Calls the admin-only `protocol-admin` edge function with the current admin session token. */
export function protocolAdmin<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    return callEdge<T>('protocol-admin', { action, ...payload }, { token: getAdminToken() });
}

/**
 * Admin protocol management. Everything goes through the `protocol-admin` edge function: the
 * `protocols` table is not readable or writable with the public anon key.
 */
export function useProtocols(options: { autoFetch?: boolean } = {}) {
    const autoFetch = options.autoFetch ?? true;
    const [protocols, setProtocols] = useState<Protocol[]>([]);
    const [loading, setLoading] = useState(autoFetch);
    const [error, setError] = useState<string | null>(null);

    const fetchProtocols = useCallback(async () => {
        try {
            setLoading(true);
            const { protocols: rows } = await protocolAdmin<{ protocols: Protocol[] }>('list');
            setProtocols(rows || []);
            setError(null);
        } catch (err) {
            console.error('Error fetching protocols:', err instanceof Error ? err.message : err);
            setError(messageOf(err, 'Failed to fetch protocols'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (autoFetch) fetchProtocols();
    }, [autoFetch, fetchProtocols]);

    const refreshIfListed = async () => {
        if (autoFetch) await fetchProtocols();
    };

    const addProtocol = async (protocol: ProtocolInput, productIds?: string[]): Promise<Result<Protocol>> => {
        try {
            const { protocol: data } = await protocolAdmin<{ protocol: Protocol }>('create', {
                protocol: pickWritable(protocol),
                ...(productIds ? { product_ids: productIds } : {}),
            });
            await refreshIfListed();
            return { success: true, data };
        } catch (err) {
            console.error('Error adding protocol:', err instanceof Error ? err.message : err);
            return { success: false, error: messageOf(err, 'Failed to add protocol') };
        }
    };

    const updateProtocol = async (id: string, updates: Partial<Protocol>): Promise<Result<Protocol>> => {
        try {
            const { protocol: data } = await protocolAdmin<{ protocol: Protocol }>('update', {
                id,
                updates: pickWritable(updates),
            });
            await refreshIfListed();
            return { success: true, data };
        } catch (err) {
            console.error('Error updating protocol:', err instanceof Error ? err.message : err);
            return { success: false, error: messageOf(err, 'Failed to update protocol') };
        }
    };

    const deleteProtocol = async (id: string): Promise<Result> => {
        try {
            await protocolAdmin('delete', { id });
            await refreshIfListed();
            return { success: true };
        } catch (err) {
            console.error('Error deleting protocol:', err instanceof Error ? err.message : err);
            return { success: false, error: messageOf(err, 'Failed to delete protocol') };
        }
    };

    const toggleActive = async (id: string, active: boolean): Promise<Result<Protocol>> => {
        try {
            const { protocol: data } = await protocolAdmin<{ protocol: Protocol }>('toggle_active', { id, active });
            await refreshIfListed();
            return { success: true, data };
        } catch (err) {
            console.error('Error toggling protocol:', err instanceof Error ? err.message : err);
            return { success: false, error: messageOf(err, 'Failed to update protocol') };
        }
    };

    const setAssignments = async (protocolId: string, productIds: string[]): Promise<Result<string[]>> => {
        try {
            const { product_ids } = await protocolAdmin<{ product_ids: string[] }>('set_assignments', {
                protocol_id: protocolId,
                product_ids: productIds,
            });
            await refreshIfListed();
            return { success: true, data: product_ids };
        } catch (err) {
            console.error('Error assigning protocol:', err instanceof Error ? err.message : err);
            return { success: false, error: messageOf(err, 'Failed to save product assignment') };
        }
    };

    return {
        protocols,
        loading,
        error,
        fetchProtocols,
        addProtocol,
        updateProtocol,
        deleteProtocol,
        toggleActive,
        setAssignments,
    };
}
