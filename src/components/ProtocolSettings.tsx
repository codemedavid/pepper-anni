import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, AlertTriangle, Save, Copy, Check } from 'lucide-react';
import { protocolAdmin } from '../hooks/useProtocols';

interface PortalSettings {
    has_password: boolean;
    password: string | null;
    updated_at: string | null;
    session_hours: number;
}

const MIN_LENGTH = 8;

/** Admin settings for the password-protected /protocols portal. */
const ProtocolSettings: React.FC = () => {
    const [settings, setSettings] = useState<PortalSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [reveal, setReveal] = useState(false);
    const [copied, setCopied] = useState(false);

    const [next, setNext] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const load = async () => {
        try {
            setLoading(true);
            const data = await protocolAdmin<PortalSettings>('get_portal_settings');
            setSettings(data);
            setLoadError(null);
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : 'Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        setSuccess(null);
        if (next.length < MIN_LENGTH) {
            setFormError(`Password must be at least ${MIN_LENGTH} characters.`);
            return;
        }
        if (next !== confirmPw) {
            setFormError('Passwords do not match.');
            return;
        }
        if (settings?.has_password &&
            !window.confirm('Changing the portal password logs everyone out of the protocol portal. Continue?')) {
            return;
        }
        setSaving(true);
        try {
            await protocolAdmin('set_portal_password', { password: next });
            setNext('');
            setConfirmPw('');
            setSuccess('Portal password saved. Existing portal sessions have been logged out.');
            await load();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Failed to save password');
        } finally {
            setSaving(false);
        }
    };

    const handleCopy = async () => {
        if (!settings?.password) return;
        try {
            await navigator.clipboard.writeText(settings.password);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            /* clipboard unavailable */
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                <KeyRound className="w-5 h-5" /> Portal password
            </h2>
            <p className="text-sm text-gray-500 mb-4">
                Customers need this password to open the Protocols page. It is included in protocol emails.
            </p>

            {loading ? (
                <p className="text-sm text-gray-500">Loading settings...</p>
            ) : loadError ? (
                <p className="text-sm text-red-600" role="alert">{loadError}</p>
            ) : (
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
                    {settings?.has_password ? (
                        <div className="flex items-center gap-2">
                            <code
                                data-testid="current-portal-password"
                                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm break-all"
                            >
                                {reveal ? settings.password ?? '(not available)' : '••••••••••'}
                            </code>
                            <button
                                type="button"
                                onClick={() => setReveal(v => !v)}
                                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                aria-label={reveal ? 'Hide current password' : 'Show current password'}
                            >
                                {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            {reveal && settings.password && (
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                    aria-label="Copy password"
                                >
                                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                                </button>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            No portal password set yet. Customers cannot open the Protocols page until you set one.
                        </p>
                    )}
                    {settings?.updated_at && settings.has_password && (
                        <p className="text-xs text-gray-400 mt-1">
                            Last changed {new Date(settings.updated_at).toLocaleString()}
                        </p>
                    )}
                </div>
            )}

            <form onSubmit={handleSave} noValidate>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                    {settings?.has_password ? 'Change password' : 'Set password'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                    <div>
                        <label htmlFor="portal-new-password" className="block text-sm font-medium text-gray-700 mb-1">
                            New password
                        </label>
                        <div className="relative">
                            <input
                                id="portal-new-password"
                                type={showNew ? 'text' : 'password'}
                                value={next}
                                onChange={(e) => setNext(e.target.value)}
                                autoComplete="new-password"
                                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                placeholder={`At least ${MIN_LENGTH} characters`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowNew(v => !v)}
                                className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-700"
                                aria-label={showNew ? 'Hide new password' : 'Show new password'}
                            >
                                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="portal-confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                            Confirm password
                        </label>
                        <input
                            id="portal-confirm-password"
                            type={showNew ? 'text' : 'password'}
                            value={confirmPw}
                            onChange={(e) => setConfirmPw(e.target.value)}
                            autoComplete="new-password"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        />
                    </div>
                </div>

                <p className="text-xs text-amber-700 flex items-start gap-1.5 mb-3">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Changing the password logs everyone out of the protocol portal. Customers will need the new password.
                </p>

                {formError && <p className="text-sm text-red-600 mb-3" role="alert">{formError}</p>}
                {success && <p className="text-sm text-green-700 mb-3">{success}</p>}

                <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save portal password'}
                </button>
            </form>
        </div>
    );
};

export default ProtocolSettings;
