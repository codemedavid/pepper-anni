import { useState, useEffect, useCallback } from 'react';
import { callEdge, EdgeError } from '../lib/edgeApi';
import type { Protocol } from './useProtocols';

// Portal session for the password-protected /protocols page (issued by the `protocol-portal` edge function).
export const PORTAL_SESSION_KEY = 'pa_protocol_portal_session';

interface PortalSession {
    token: string;
    expires_at: string;
}

function readSession(): PortalSession | null {
    try {
        const raw = localStorage.getItem(PORTAL_SESSION_KEY);
        if (!raw) return null;
        const s = JSON.parse(raw) as PortalSession;
        if (!s?.token) return null;
        if (s.expires_at && new Date(s.expires_at).getTime() <= Date.now()) {
            localStorage.removeItem(PORTAL_SESSION_KEY);
            return null;
        }
        return s;
    } catch {
        return null;
    }
}

function writeSession(s: PortalSession | null): void {
    try {
        if (s) localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(s));
        else localStorage.removeItem(PORTAL_SESSION_KEY);
    } catch {
        /* storage unavailable: session lasts for this page only */
    }
}

// One-click links in protocol emails look like /protocols#access=<token>. The token is in the fragment, so it
// never reaches the web server; it is removed from the address bar as soon as the page reads it.
const ACCESS_PARAM = 'access';

function readLinkToken(): string | null {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return null;
    const token = new URLSearchParams(hash).get(ACCESS_PARAM);
    return token && token.length <= 1000 ? token : null;
}

function clearLinkToken(): void {
    try {
        const { pathname, search } = window.location;
        window.history.replaceState(window.history.state, '', pathname + search);
    } catch {
        /* history unavailable: leave the address bar as it is */
    }
}

/**
 * Public protocol portal. Protocol content is only returned by the server after the portal password
 * has been entered; file/image protocols come back with short-lived signed URLs in `file_url`.
 */
export function usePortalProtocols() {
    const [session, setSession] = useState<PortalSession | null>(() => readSession());
    const [protocols, setProtocols] = useState<Protocol[]>([]);
    const [loading, setLoading] = useState<boolean>(() => !!readSession() || !!readLinkToken());
    const [unlocking, setUnlocking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const lock = useCallback(() => {
        writeSession(null);
        setSession(null);
        setProtocols([]);
        setLoading(false);
    }, []);

    const fetchProtocols = useCallback(async (token: string) => {
        try {
            setLoading(true);
            const { protocols: rows } = await callEdge<{ protocols: Protocol[] }>(
                'protocol-portal',
                { action: 'list' },
                { token },
            );
            setProtocols(rows || []);
            setError(null);
        } catch (err) {
            if (err instanceof EdgeError && err.status === 401) {
                lock();
                setError('Your session has expired. Please enter the password again.');
                return;
            }
            setError(err instanceof Error ? err.message : 'Failed to load protocols');
        } finally {
            setLoading(false);
        }
    }, [lock]);

    useEffect(() => {
        if (session?.token) fetchProtocols(session.token);
    }, [session?.token, fetchProtocols]);

    // Opened from the email button: swap the link token for a normal portal session (no password needed).
    useEffect(() => {
        const linkToken = readLinkToken();
        if (!linkToken) return;
        clearLinkToken();
        // `loading` already starts true when a link token is present; the list fetch then clears it.
        callEdge<PortalSession>('protocol-portal', { action: 'redeem', token: linkToken })
            .then((s) => {
                writeSession(s);
                setSession(s);
                setError(null);
            })
            .catch(() => {
                // Keep a session the visitor already has; otherwise fall back to the password card.
                if (readSession()) return;
                setLoading(false);
                setError('This link has expired. Please enter the password from your email.');
            });
    }, []);

    const unlock = useCallback(async (password: string): Promise<{ success: boolean; error?: string }> => {
        if (!password) return { success: false, error: 'Please enter the password' };
        setUnlocking(true);
        setError(null);
        try {
            const s = await callEdge<PortalSession>('protocol-portal', { action: 'unlock', password });
            writeSession(s);
            setSession(s);
            return { success: true };
        } catch (err) {
            const msg = err instanceof EdgeError && err.status === 401
                ? 'Incorrect password. Please try again.'
                : 'Could not unlock right now. Please try again.';
            setError(msg);
            return { success: false, error: msg };
        } finally {
            setUnlocking(false);
        }
    }, []);

    return {
        locked: !session,
        protocols,
        loading,
        unlocking,
        error,
        unlock,
        lock,
        refresh: () => (session?.token ? fetchProtocols(session.token) : Promise.resolve()),
    };
}
