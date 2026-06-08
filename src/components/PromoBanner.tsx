import React, { useState, useEffect } from 'react';
import { X, Gift, ArrowRight, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import posthog, { identifyUser } from '../lib/posthog';

const DISMISSED_KEY = 'tbs_promo_banner_dismissed';

const PromoBanner: React.FC = () => {
  const [email, setEmail] = useState('');
  const [dismissed, setDismissed] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const wasDismissed = localStorage.getItem(DISMISSED_KEY);
    if (!wasDismissed) {
      setDismissed(false);
      posthog.capture('tbs_promo_banner_viewed');
    }
  }, []);

  // Reset back to email form after showing confirmation
  useEffect(() => {
    if (!submitted) return;
    const timer = setTimeout(() => {
      setSubmitted(false);
      setEmail('');
    }, 3000);
    return () => clearTimeout(timer);
  }, [submitted]);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, 'true');
    posthog.capture('tbs_promo_banner_dismissed');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const normalized = email.trim().toLowerCase();
    if (!normalized) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) {
      setError('Please enter a valid email address');
      return;
    }

    setSubmitting(true);
    try {
      const { error: dbError } = await supabase
        .rpc('subscribe_to_promos', { p_email: normalized, p_source: 'tbs_promo_banner' });

      if (dbError) {
        setError('Something went wrong. Please try again.');
      } else {
        setSubmitted(true);
        identifyUser(normalized, { subscribed: true, subscription_source: 'promo_banner' });
        posthog.capture('tbs_promo_banner_subscribed', { email: normalized });
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 text-white relative z-40">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {submitted ? (
            <div className="flex items-center gap-2 text-sm font-medium animate-fadeIn">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>You're in! We'll send you exclusive promos and updates.</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Gift className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">Get exclusive promos & updates straight to your inbox!</span>
                <span className="sm:hidden">Get exclusive promos!</span>
              </div>

              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="Enter your email"
                  className="px-3 py-1.5 rounded-lg text-sm text-charcoal-800 bg-white/95 placeholder-charcoal-400 focus:outline-none focus:ring-2 focus:ring-white/50 w-48 sm:w-56"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1 px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Joining...' : 'Join'}
                  {!submitting && <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </form>

              {error && (
                <span className="text-xs text-red-200">{error}</span>
              )}
            </>
          )}

          <button
            onClick={handleDismiss}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/20 rounded-lg transition-colors"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromoBanner;
