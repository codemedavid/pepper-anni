import React, { useState, useEffect, useCallback } from 'react';
import { X, ExternalLink, ScanLine, Copy, Check } from 'lucide-react';
import posthog from '../lib/posthog';
import { PROMO_POPUP_CLOSED_EVENT, PROMO_POPUP_SHOWN_KEY } from './PromoPopup';

export const TIKTOK_HANDLE = 'mima.ann.talks.peppers';
export const TIKTOK_NAME = 'Mima Ann Talks Peppers';
export const TIKTOK_URL = `https://www.tiktok.com/@${TIKTOK_HANDLE}`;

const LAST_SHOWN_KEY = 'tiktok_popup_last_shown';
const FOLLOWED_KEY = 'tiktok_popup_followed';
const SHOW_AGAIN_AFTER_MS = 3 * 24 * 60 * 60 * 1000; // re-show every 3 days until they follow
const DELAY_MS = 6000;
const DELAY_AFTER_PROMO_MS = 1500;

const safeGet = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const safeSet = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
};

const TikTokIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
  </svg>
);

const shouldShow = () => {
  if (safeGet(FOLLOWED_KEY)) return false;
  const last = Number(safeGet(LAST_SHOWN_KEY) || 0);
  return Date.now() - last > SHOW_AGAIN_AFTER_MS;
};

const TikTokPopup: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!shouldShow()) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const open = (delay: number) => {
      timer = setTimeout(() => {
        setVisible(true);
        safeSet(LAST_SHOWN_KEY, String(Date.now()));
        posthog.capture('tiktok_popup_viewed');
      }, delay);
    };

    // The email promo popup shows once on a first visit. Don't stack on top of it:
    // wait until it's closed, then follow up with the TikTok invite.
    const promoPending = !safeGet(PROMO_POPUP_SHOWN_KEY);
    if (promoPending) {
      const onPromoClosed = () => open(DELAY_AFTER_PROMO_MS);
      window.addEventListener(PROMO_POPUP_CLOSED_EVENT, onPromoClosed, { once: true });
      return () => {
        window.removeEventListener(PROMO_POPUP_CLOSED_EVENT, onPromoClosed);
        if (timer) clearTimeout(timer);
      };
    }

    open(DELAY_MS);
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    posthog.capture('tiktok_popup_dismissed');
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [visible, handleClose]);

  const handleFollow = () => {
    safeSet(FOLLOWED_KEY, 'true');
    posthog.capture('tiktok_popup_follow_clicked');
    setVisible(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`@${TIKTOK_HANDLE}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tiktok-popup-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-charcoal-900/60 backdrop-blur-sm animate-fadeIn"
        onClick={handleClose}
      />

      {/* Modal — bottom sheet on mobile, centered card on larger screens */}
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-luxury overflow-hidden animate-slideUp max-h-[92vh] overflow-y-auto">
        {/* Header band */}
        <div className="relative h-28 bg-gradient-to-br from-charcoal-900 via-brand-800 to-brand-500">
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_20%,#25F4EE_0,transparent_40%),radial-gradient(circle_at_80%_70%,#FE2C55_0,transparent_45%)]" />
          <div className="absolute top-3 left-4 flex items-center gap-1.5 text-white/90 text-xs font-semibold tracking-wide">
            <TikTokIcon className="w-4 h-4" />
            TikTok
          </div>
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 p-2 rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          {/* Mobile grab handle */}
          <div className="sm:hidden absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-white/40" />
        </div>

        <div className="px-6 pb-6 -mt-12 text-center">
          {/* Avatar */}
          <img
            src="/tiktok-avatar.jpg"
            alt={TIKTOK_NAME}
            className="relative w-24 h-24 mx-auto rounded-full object-cover ring-4 ring-white shadow-lg"
          />

          <h3 id="tiktok-popup-title" className="mt-3 text-xl font-heading font-bold text-charcoal-900">
            {TIKTOK_NAME}
          </h3>
          <button
            onClick={handleCopy}
            className="mt-0.5 inline-flex items-center gap-1 text-sm text-charcoal-400 hover:text-brand-600 transition-colors"
            title="Copy handle"
          >
            @{TIKTOK_HANDLE}
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <p className="mt-3 text-sm text-charcoal-500 leading-relaxed">
            Peptide tips, product breakdowns, and first dibs on promos. Come hang out with us on TikTok!
          </p>

          {/* QR code — most useful on desktop, where they can scan with a phone */}
          <div className="mt-5 hidden sm:block">
            <div className="mx-auto w-52 p-3 rounded-2xl bg-white border border-charcoal-100 shadow-sm">
              <img src="/tiktok-qr.jpg" alt={`QR code for TikTok @${TIKTOK_HANDLE}`} className="w-full h-auto" />
            </div>
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-charcoal-400">
              <ScanLine className="w-3.5 h-3.5" />
              Scan with your phone camera
            </p>
          </div>

          <a
            href={TIKTOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleFollow}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-charcoal-900 hover:bg-black text-white font-semibold py-3.5 transition-colors shadow-md"
          >
            <TikTokIcon className="w-5 h-5" />
            Follow on TikTok
            <ExternalLink className="w-4 h-4 opacity-70" />
          </a>

          {/* On mobile, keep the QR available but tucked away */}
          <details className="sm:hidden mt-3 text-left">
            <summary className="text-center text-xs text-charcoal-400 cursor-pointer list-none">
              Show QR code
            </summary>
            <div className="mt-3 mx-auto w-48 p-3 rounded-2xl bg-white border border-charcoal-100">
              <img src="/tiktok-qr.jpg" alt={`QR code for TikTok @${TIKTOK_HANDLE}`} className="w-full h-auto" />
            </div>
          </details>

          <button
            onClick={handleClose}
            className="mt-3 text-xs text-charcoal-400 hover:text-charcoal-600 transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
};

export default TikTokPopup;
