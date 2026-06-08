import React, { useState, useEffect } from 'react';
import { X, Sparkles, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import posthog, { identifyUser } from '../lib/posthog';

const SHOWN_KEY = 'tbs_promo_popup_shown';
const SUBMITTED_KEY = 'tbs_promo_popup_submitted';
const POPUP_DELAY_MS = 2000;

const PromoPopup: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const wasShown = localStorage.getItem(SHOWN_KEY);
    if (wasShown) return;

    const timer = setTimeout(() => {
      setVisible(true);
      localStorage.setItem(SHOWN_KEY, 'true');
      posthog.capture('tbs_promo_popup_viewed');
    }, POPUP_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setVisible(false);
    posthog.capture('tbs_promo_popup_dismissed');
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
        .rpc('subscribe_to_promos', { p_email: normalized, p_source: 'tbs_promo_popup' });

      if (dbError) {
        setError('Something went wrong. Please try again.');
      } else {
        setSubmitted(true);
        localStorage.setItem(SUBMITTED_KEY, 'true');
        identifyUser(normalized, { subscribed: true, subscription_source: 'promo_popup' });
        posthog.capture('tbs_promo_popup_subscribed', { email: normalized });
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-charcoal-900/50 backdrop-blur-sm animate-fadeIn"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-luxury max-w-md w-full overflow-hidden animate-slideUp">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 text-charcoal-400 hover:text-charcoal-700 hover:bg-charcoal-50 rounded-lg transition-colors z-10"
          aria-label="Close popup"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Accent Bar */}
        <div className="h-1.5 bg-gradient-to-r from-brand-700 via-brand-400 to-brand-600" />

        <div className="p-8 text-center">
          {submitted ? (
            <div className="animate-fadeIn">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-xl font-heading font-bold text-charcoal-900 mb-2">
                You're on the list!
              </h3>
              <p className="text-charcoal-500 text-sm mb-6">
                We'll keep you updated with exclusive promos, new arrivals, and special offers.
              </p>
              <button
                onClick={handleClose}
                className="btn-primary w-full"
              >
                Start Shopping
              </button>
            </div>
          ) : (
            <>
              {/* Icon */}
              <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <Sparkles className="w-8 h-8 text-brand-600" />
              </div>

              {/* Heading */}
              <h3 className="text-2xl font-heading font-bold text-charcoal-900 mb-2">
                Don't Miss Out!
              </h3>
              <p className="text-charcoal-500 text-sm mb-6 leading-relaxed">
                Enter your email to receive exclusive promos, early access to new products, and special deals from PepperAnni.
              </p>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="your@email.com"
                  className="input-field text-center"
                  autoFocus
                />

                {error && (
                  <p className="text-sm text-red-500">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    'Subscribing...'
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Get Exclusive Promos
                    </>
                  )}
                </button>
              </form>

              <button
                onClick={handleClose}
                className="mt-4 text-xs text-charcoal-400 hover:text-charcoal-600 transition-colors"
              >
                No thanks, maybe later
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PromoPopup;
